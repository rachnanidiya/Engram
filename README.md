
# Engram : AI-Powered Spaced Repetition Flashcard Studio

Engram is a full-stack web application designed to automatically decompose complex learning materials, lecture notes, and textbook PDFs into structured, high-yield flashcard study decks using the Google Gemini API. Featuring a dynamic layout system and an automated spaced-repetition algorithm, the platform optimizes long-term memory retention through interactive study modes.

---

## 🚀 Key Features

* **Multimodal AI Ingestion:** Supports raw textual input copy-pasting as well as localized, secure multipart physical PDF parsing via `pypdf`.
* **Superliminal Spaced Repetition Engine:** Implements a dynamic memory scheduling grid that adjusts individual card review horizons ($1 \rightarrow 3 \rightarrow 7 \rightarrow 2N$ days) based on real-time active user recall performance feedback loops.
* **Fuzzy Keyword-Intersection Quiz Evaluator:** Utilizes an algorithmic tokenized matching system that strips filler stop-words and calculates conceptual intersection ratios, validating paragraph-length user definitions accurately without strict substring bottlenecks.
* **Dual-Format Serialization Exporters:** Features clean client-side backups compiling your active collections instantly into standard `.txt` schemas or styled, multi-page vector `.pdf` files utilizing the `jsPDF` library framework layers.
* **Real-Time Progress Metrics Matrix:** Displays live interactive visual indicators analyzing total cards, memorized counts, pending due stacks, and localized completion metrics.

---

## 🛡️ Defensive Engineering Guardrails

The application pipeline has been deliberately architected using security and performance best practices to ensure a stable local environment:

1. **Denial-of-Service (DoS) Ingestion Guardrails:** Mitigates memory exhaustion and host container crashes by strictly truncating physical file streams to a maximum of 40 pages and clamping downstream character payload boundaries to 80,000 text units before processing.
2. **Atomic Database Batch Transactions:** Eliminates write collisions and `database is locked` runtime failures by staging bulk flashcard configurations in-memory using SQLAlchemy session pools, collapsing $N$ separate relational disk hits down to exactly one atomic database commit.
3. **Sanitized Exception Integrity Logging:** Protects backend architecture footprints from information disclosure. Internal tracebacks are captured securely in server logs, while clean, generic response messages are routed to the public client layer.

---

## 🛠️ Tech Stack & Architecture

* **Backend Engine:** Flask (Python 3.10+)
* **Database ORM Grid:** SQLite with Flask-SQLAlchemy Core Mapping Rules
* **AI Inference Layer:** Google GenAI SDK (`gemini-2.5-flash`)
* **UI Layout System:** Clean Minimal Theme System structured over CSS Glassmorphic panels, explicit flex-grow layout distributions, and fluid 3D card perspective engines.

---

## ⚙️ Local Installation Guide

Follow these steps to set up and run the application locally on your machine.

### 1. Clone the Workspace Container
```bash
git clone [https://github.com/your-username/engram-flashcard-studio.git](https://github.com/your-username/engram-flashcard-studio.git)
cd engram-flashcard-studio

```

### 2. Configure Local Virtual Environment

Create and activate a virtual environment to isolate project dependencies:

```bash
python -m venv venv

# On Windows (cmd/powershell):
venv\Scripts\activate

# On Mac/Linux:
source venv/bin/activate

```

### 3. Install Package Dependencies Array

```bash
pip install -r requirements.txt

```

### 4. Setup Local Environment Parameters

Create a file named `.env` inside your root project directory and add your API key along with the database location:

```text
GEMINI_API_KEY=your_secret_gemini_api_key_here
DATABASE_URL=sqlite:///flashcards.db

```

### 5. Initialize & Launch Web App Core

Run the startup script to initialize the SQLite database tables and start the local development server:

```bash
python app.py

```

Open your web browser and navigate cleanly to: `http://127.0.0.1:5000`

```

***

### 📝 Your `requirements.txt` Checklist
Make sure your project folder contains a file named `requirements.txt` with these dependencies so the installation step works correctly:
```text
Flask==3.0.2
Flask-SQLAlchemy==3.1.1
google-genai==0.1.1
pypdf==4.1.0
python-dotenv==1.0.1

```

