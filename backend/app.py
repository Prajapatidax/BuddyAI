import os
import sqlite3
import uuid
from datetime import datetime
from functools import wraps
from datetime import timedelta

from PyPDF2 import PdfReader
from docx import Document
from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

import google.generativeai as genai


load_dotenv()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.getenv("SQLITE_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "buddyai.db"))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
ALLOWED_EXTENSIONS = {"pdf", "docx"}
MAX_DOCUMENT_CONTEXT_CHARS = 120_000
VALID_ROLES = {"Student", "Faculty"}


def env_bool(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def create_app():
    app = Flask(
        __name__,
        template_folder=os.path.join(BASE_DIR, "templates"),
        static_folder=os.path.join(BASE_DIR, "static"),
    )

    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret-change-me")
    app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
    app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = os.getenv("SESSION_COOKIE_SAMESITE", "Lax")
    app.config["SESSION_COOKIE_SECURE"] = env_bool("SESSION_COOKIE_SECURE", default=True)
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=int(os.getenv("SESSION_TTL_DAYS", "7")))

    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    init_db()
    configure_gemini()

    register_routes(app)
    return app


def configure_gemini():
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        genai.configure(api_key=api_key)


def init_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
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
    cursor.execute("PRAGMA table_info(users)")
    columns = {row[1] for row in cursor.fetchall()}
    if "role" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'Student'")
    conn.commit()
    conn.close()


def db_execute(query, params=(), fetchone=False, fetchall=False):
    conn = sqlite3.connect(DB_PATH, timeout=10)
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


def normalize_role(role):
    normalized = (role or "Student").strip().title()
    return normalized if normalized in VALID_ROLES else "Student"


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
    @app.after_request
    def add_security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Cache-Control", "no-store")
        return response

    @app.route("/health")
    def health():
        return jsonify({"status": "ok"}), 200

    @app.route("/auth")
    def auth_page():
        return redirect(url_for("login_page"))

    @app.route("/")
    def index():
        return render_template("index.html", is_logged_in="user_id" in session)

    @app.route("/login", methods=["GET", "POST"])
    def login_page():
        if request.method == "GET":
            if "user_id" in session:
                return redirect(url_for("dashboard"))
            return render_template("login.html", default_role=normalize_role(request.args.get("role")))

        payload = request.get_json(silent=True) or request.form
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password") or ""

        user = db_execute("SELECT * FROM users WHERE email = ?", (email,), fetchone=True)
        if not user or not check_password_hash(user["password_hash"], password):
            return jsonify({"error": "Invalid credentials."}), 401

        session["user_id"] = user["id"]
        session["username"] = user["username"]
        session["role"] = normalize_role(user["role"])
        session.setdefault("chat_session_id", str(uuid.uuid4()))

        return jsonify(
            {
                "message": "Login successful.",
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "email": user["email"],
                    "role": session["role"],
                },
            }
        )

    @app.route("/signup", methods=["GET", "POST"])
    def signup_page():
        if request.method == "GET":
            if "user_id" in session:
                return redirect(url_for("dashboard"))
            return render_template("signup.html", default_role=normalize_role(request.args.get("role")))

        payload = request.get_json(silent=True) or request.form
        username = (payload.get("username") or "").strip()
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password") or ""
        role = normalize_role(payload.get("role"))

        if not username or not email or not password:
            return jsonify({"error": "All fields are required."}), 400

        if len(password) < 6:
            return jsonify({"error": "Password must be at least 6 characters."}), 400

        if role not in VALID_ROLES:
            return jsonify({"error": "Please choose either Student or Faculty."}), 400

        password_hash = generate_password_hash(password)

        try:
            db_execute(
                "INSERT INTO users (username, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
                (username, email, password_hash, role, datetime.utcnow().isoformat()),
            )
            return jsonify({"message": "Signup successful. Please login.", "role": role}), 201
        except sqlite3.IntegrityError:
            return jsonify({"error": "Username or email already exists."}), 409

    @app.route("/dashboard")
    def dashboard():
        if "user_id" not in session:
            return redirect(url_for("login_page"))

        return redirect(url_for("chat_app"))

    @app.route("/app")
    def chat_app():
        if "user_id" not in session:
            return redirect(url_for("login_page"))

        user = {
            "id": session.get("user_id"),
            "username": session.get("username"),
            "role": normalize_role(session.get("role")),
        }
        return render_template("chat.html", user=user)

    @app.route("/student-dashboard")
    def student_dashboard():
        return redirect(url_for("chat_app"))

    @app.route("/faculty-dashboard")
    def faculty_dashboard():
        return redirect(url_for("chat_app"))

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
    port = int(os.getenv("PORT", "5000"))
    debug = env_bool("FLASK_DEBUG", default=False)
    app.run(host="0.0.0.0", port=port, debug=debug)
