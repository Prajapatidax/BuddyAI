import os
import sqlite3
import uuid
from datetime import datetime
from functools import wraps

from PyPDF2 import PdfReader
from docx import Document
from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

import google.generativeai as genai


load_dotenv()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "buddyai.db")
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
ALLOWED_EXTENSIONS = {"pdf", "docx"}
MAX_DOCUMENT_CONTEXT_CHARS = 120_000


def create_app():
    app = Flask(
        __name__,
        template_folder=os.path.join(BASE_DIR, "templates"),
        static_folder=os.path.join(BASE_DIR, "static"),
    )

    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret-change-me")
    app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
    app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB

    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    init_db()
    configure_gemini()

    register_routes(app)
    return app


def configure_gemini():
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        genai.configure(api_key=api_key)


def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def db_execute(query, params=(), fetchone=False, fetchall=False):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(query, params)

    result = None
    if fetchone:
        result = cursor.fetchone()
    elif fetchall:
        result = cursor.fetchall()

    conn.commit()
    conn.close()
    return result


def login_required(route_func):
    @wraps(route_func)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Unauthorized"}), 401
        return route_func(*args, **kwargs)

    return wrapper


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def extract_text_from_pdf(path):
    reader = PdfReader(path)
    pages = []
    for page in reader.pages:
        pages.append(page.extract_text() or "")
    return "\n".join(pages).strip()


def extract_text_from_docx(path):
    doc = Document(path)
    paragraphs = [paragraph.text for paragraph in doc.paragraphs]
    return "\n".join(paragraphs).strip()


def build_model():
    model_name = os.getenv("GEMINI_MODEL", "gemini-1.5-pro")
    return genai.GenerativeModel(model_name)


def query_gemini(user_query, context_text, mode="default"):
    if not os.getenv("GEMINI_API_KEY"):
        return "Gemini API key is missing. Please set GEMINI_API_KEY in your environment."

    model = build_model()

    style_instruction = ""
    if mode == "eli5":
        style_instruction = "Explain the answer like I am 5 years old, using very simple words and examples."
    elif mode == "notes":
        style_instruction = "Generate concise study notes in bullet points with headings."

    prompt = (
        "You are BuddyAI, a smart academic assistant. "
        "Give clear, simple and structured responses. "
        "If the answer is uncertain, say so honestly.\n\n"
        f"Document Context:\n{context_text[:MAX_DOCUMENT_CONTEXT_CHARS]}\n\n"
        f"User Query:\n{user_query}\n\n"
        f"Special Instruction: {style_instruction if style_instruction else 'Normal response mode.'}"
    )

    response = model.generate_content(prompt)
    return (response.text or "I could not generate a response.").strip()


def summarize_document(context_text):
    summary_prompt = "Provide a concise summary of this document for a student. Use short sections and bullet points."
    return query_gemini(summary_prompt, context_text, mode="default")


def register_routes(app):
    @app.route("/")
    def index():
        return render_template("index.html", is_logged_in="user_id" in session)

    @app.route("/auth")
    def auth_page():
        if "user_id" in session:
            return redirect(url_for("dashboard"))
        return render_template("auth.html")

    @app.route("/dashboard")
    def dashboard():
        if "user_id" not in session:
            return redirect(url_for("auth_page"))

        user = {
            "id": session.get("user_id"),
            "username": session.get("username"),
        }
        return render_template("dashboard.html", user=user)

    @app.route("/signup", methods=["POST"])
    def signup():
        payload = request.get_json(silent=True) or request.form
        username = (payload.get("username") or "").strip()
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password") or ""

        if not username or not email or not password:
            return jsonify({"error": "All fields are required."}), 400

        if len(password) < 6:
            return jsonify({"error": "Password must be at least 6 characters."}), 400

        password_hash = generate_password_hash(password)

        try:
            db_execute(
                "INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (username, email, password_hash, datetime.utcnow().isoformat()),
            )
            return jsonify({"message": "Signup successful. Please login."}), 201
        except sqlite3.IntegrityError:
            return jsonify({"error": "Username or email already exists."}), 409

    @app.route("/login", methods=["POST"])
    def login():
        payload = request.get_json(silent=True) or request.form
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password") or ""

        user = db_execute("SELECT * FROM users WHERE email = ?", (email,), fetchone=True)
        if not user or not check_password_hash(user["password_hash"], password):
            return jsonify({"error": "Invalid credentials."}), 401

        session["user_id"] = user["id"]
        session["username"] = user["username"]
        session.setdefault("chat_session_id", str(uuid.uuid4()))

        return jsonify(
            {
                "message": "Login successful.",
                "user": {"id": user["id"], "username": user["username"], "email": user["email"]},
            }
        )

    @app.route("/logout")
    def logout():
        session.clear()
        return redirect(url_for("index"))

    @app.route("/upload", methods=["POST"])
    @login_required
    def upload_file():
        if "file" not in request.files:
            return jsonify({"error": "No file part in request."}), 400

        file = request.files["file"]
        if file.filename == "":
            return jsonify({"error": "No file selected."}), 400

        if not allowed_file(file.filename):
            return jsonify({"error": "Only PDF and DOCX files are allowed."}), 400

        original_name = secure_filename(file.filename)
        unique_name = f"{uuid.uuid4().hex}_{original_name}"
        file_path = os.path.join(app.config["UPLOAD_FOLDER"], unique_name)
        file.save(file_path)

        try:
            extension = original_name.rsplit(".", 1)[1].lower()
            if extension == "pdf":
                extracted_text = extract_text_from_pdf(file_path)
            else:
                extracted_text = extract_text_from_docx(file_path)

            if not extracted_text:
                return jsonify({"error": "Could not extract text from this file."}), 400

            session["document_text"] = extracted_text
            session["document_name"] = original_name

            summary = summarize_document(extracted_text)

            return jsonify(
                {
                    "message": "File processed successfully.",
                    "filename": original_name,
                    "summary": summary,
                    "char_count": len(extracted_text),
                }
            )
        except Exception as exc:
            return jsonify({"error": f"Failed to process file: {str(exc)}"}), 500
        finally:
            if os.path.exists(file_path):
                os.remove(file_path)

    @app.route("/chat", methods=["POST"])
    @login_required
    def chat():
        payload = request.get_json(silent=True) or {}
        query = (payload.get("query") or "").strip()
        mode = (payload.get("mode") or "default").strip().lower()

        if not query:
            return jsonify({"error": "Query is required."}), 400

        context_text = session.get("document_text", "")
        try:
            if not context_text:
                general_context = (
                    "No uploaded document is available. "
                    "Answer using general academic knowledge with clear and simple explanation."
                )
                reply = query_gemini(query, general_context, mode=mode)
                return jsonify({"reply": reply, "mode": mode, "source": "gemini"})

            reply = query_gemini(query, context_text, mode=mode)
            return jsonify({"reply": reply, "mode": mode, "source": "gemini"})
        except Exception as exc:
            return jsonify({"error": f"AI response failed: {str(exc)}"}), 500

    @app.route("/history", methods=["GET"])
    @login_required
    def history():
        return jsonify(
            {
                "chat_session_id": session.get("chat_session_id"),
                "document_name": session.get("document_name"),
            }
        )


app = create_app()


if __name__ == "__main__":
    app.run(debug=True)
