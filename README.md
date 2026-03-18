# BuddyAI

BuddyAI is a full-stack AI-powered academic assistant built with Flask, SQLite, IndexedDB, and Google Gemini.

## Features

- User authentication with SQLite (signup/login/logout)
- Password hashing using `werkzeug.security`
- PDF and DOCX upload with text extraction
- Gemini-powered document summary and chat Q&A
- Explain Like I am 5 mode and Generate Notes mode
- Chat history storage in browser with IndexedDB
- Responsive modern UI with dark/light theme toggle
- Loading animation and typing effect for AI responses

## Project Structure

- `backend/` Flask backend and SQLite setup
- `templates/` HTML pages
- `static/` CSS and JavaScript assets
- `uploads/` temporary uploaded files (auto-created and cleaned)

## Setup

1. Create a virtual environment and install dependencies:

```bash
pip install -r requirements.txt
```

2. Create environment variables:

```bash
copy .env.example .env
```

3. Update `.env` with your values:

- `SECRET_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (default: `gemini-1.5-pro`)

4. Run the app:

```bash
python run.py
```

5. Open in browser:

- `http://127.0.0.1:5000`

## API Routes

- `POST /signup`
- `POST /login`
- `GET /logout`
- `POST /upload`
- `POST /chat`
- `GET /history`

## Notes

- Max file size is 10 MB.
- Allowed upload formats are PDF and DOCX.
- The backend stores extracted document text in session for chat context.
- If there is no uploaded document, `/chat` still answers using Gemini general academic knowledge.
- IndexedDB stores local chat sessions with:
  - `chat_id`
  - `user_id`
  - `messages`
  - `timestamp`
