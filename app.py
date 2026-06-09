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
        text = data.get("text")
        
        # Capture the optional deck_id sent by the frontend
        current_context_deck_id = data.get("deck_id")

        if not text:
            return jsonify({"error": "No text provided"}), 400

        target_deck = None

        if current_context_deck_id:

            target_deck = Deck.query.get(current_context_deck_id)
            if not target_deck:
                return jsonify({"error": "Original deck not found"}), 404
            print(f"Adding cards to EXISTING Deck ID: {target_deck.id}")
        else:
           
            target_deck = Deck(title=f"AI Generated Deck ({datetime.utcnow().strftime('%H:%M')})")
            db.session.add(target_deck)
            db.session.commit() # Committing assigns an ID immediately
            print(f"Spawning NEW Deck ID: {target_deck.id}")


        cards_data = generate_flashcards(text)

        if not cards_data:
            return jsonify({"error": "Failed to generate flashcards from the text"}), 500

        saved_cards = []
        for item in cards_data:
            new_card = Flashcard(
                deck_id=target_deck.id,
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

        return jsonify({
            "status": "success",
            "deck_id": target_deck.id,
            "cards": saved_cards
        })

    except Exception as e:
        print("ERROR IN /generate route:", str(e))
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
    
@app.route("/decks", methods=["GET"])
def get_decks():
    try:
        all_decks = Deck.query.order_by(Deck.created_at.desc()).all()
        decks_list = [{"id": d.id, "title": f"Deck #{d.id} ({len(d.cards)} cards)"} for d in all_decks]
        return jsonify({"decks": decks_list})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/decks/<int:deck_id>/cards", methods=["GET"])
def get_deck_cards(deck_id):
    try:
        deck = Deck.query.get(deck_id)
        if not deck:
            return jsonify({"error": "Deck not found"}), 404
        
        cards_list = [{"id": c.id, "question": c.question, "answer": c.answer} for c in deck.cards]
        return jsonify({"cards": cards_list})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)