import os
import json
from flask import Flask, request, jsonify, render_template
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
from openai import OpenAI

from models import db, Flashcard   # IMPORTANT: import from models.py

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///flashcards.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)

with app.app_context():
    db.create_all()

@app.route("/")
def home():
    return render_template("index.html")

def generate_flashcards(text):
    return [
        {"question": "What is AI?", "answer": "Simulation of human intelligence"},
        {"question": "What is ML?", "answer": "Subset of AI that learns from data"},
        {"question": "What is Python?", "answer": "Programming language used for AI"}
    ]
    return json.loads(content)

@app.route("/generate", methods=["POST"])
def generate():
    try:
        data = request.get_json()
        print("REQUEST DATA:", data)

        text = data.get("text") if data else None

        if not text:
            return jsonify({"error": "No text provided"}), 400

        cards = generate_flashcards(text)

        print("CARDS GENERATED:", cards)

        return jsonify({
            "cards": cards
        })

    except Exception as e:
        print("ERROR IN /generate:", str(e))
        return jsonify({
            "error": str(e)
        }), 500


if __name__ == "__main__":
    app.run(debug=True)