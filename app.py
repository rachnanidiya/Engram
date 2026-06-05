import os
import json
from flask import Flask, request, jsonify, render_template
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
from google import genai

from models import db, Flashcard, Deck  

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

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
    """
    Sends raw notes to the free Gemini API and requests plain text JSON arrays.
    """
    prompt = f"""
    You are an expert educational assistant. Create flashcards from the text below.
    You must respond ONLY with a raw JSON array containing objects with 'question' and 'answer' keys.
    Do not include any markdown backticks, intro text, or code block formatting like ```json.
    
    Text: {text}
    """

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        
      
        clean_text = response.text.strip().replace("```json", "").replace("```", "")
        return json.loads(clean_text)
        
    except Exception as e:
        print("Gemini API Error details:", str(e))
        return []


@app.route("/generate", methods=["POST"])
def generate():
    try:
        data = request.get_json()
        text = data.get("text") if data else None

        if not text:
            return jsonify({"error": "No text provided"}), 400

    
        new_deck = Deck(title="AI Generated Deck")
        db.session.add(new_deck)
        db.session.commit()  

       
        cards_data = generate_flashcards(text)

        if not cards_data:
            return jsonify({"error": "Failed to generate flashcards from the text"}), 500

        saved_cards = []
        for item in cards_data:
            new_card = Flashcard(
                deck_id=new_deck.id,
                question=item.get("question"),
                answer=item.get("answer")
            )
            db.session.add(new_card)
            db.session.commit()
            
            saved_cards.append({
                "id": new_card.id,
                "question": new_card.question,
                "answer": new_card.answer
            })

        print(f"SUCCESS: Saved {len(saved_cards)} cards under Deck ID {new_deck.id}")

        return jsonify({
            "status": "success",
            "deck_id": new_deck.id,
            "cards": saved_cards
        })

    except Exception as e:
        print("ERROR IN /generate route:", str(e))
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)