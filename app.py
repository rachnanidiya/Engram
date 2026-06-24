from datetime import datetime, timedelta
import os
import json
from flask import Flask, request, jsonify, render_template
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
from google import genai
from pypdf import PdfReader
from models import db, Flashcard, Deck  

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("CRITICAL CONFIGURATION ERROR: GEMINI_API_KEY is missing from host variables.")

client = genai.Client(api_key=api_key)

app = Flask(__name__)

app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL", "sqlite:///flashcards.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)

with app.app_context():
    db.create_all()

@app.route("/")
def home():
    return render_template("index.html")


def generate_flashcards(text):
    """
    Sends raw notes to the Gemini API and requests plain text JSON arrays.
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
        # Log real error to server terminal, hide internal state from external layers
        print("SECURE SERVER LOG [Gemini Fault]:", str(e))
        return []


@app.route("/generate", methods=["POST"])
def generate():
    try:
        text = ""
        current_context_deck_id = None

        # Secured Multipart Form File Ingestion
        if request.content_type and "multipart/form-data" in request.content_type:
            current_context_deck_id = request.form.get("deck_id")
            
            if current_context_deck_id == "null" or not current_context_deck_id:
                current_context_deck_id = None
            else:
                current_context_deck_id = int(current_context_deck_id)

            if "file" in request.files:
                uploaded_file = request.files["file"]
                if uploaded_file.filename != "":
                    
                    # Block malicious zero-byte payloads or alternate file extensions
                    if not uploaded_file.filename.lower().endswith('.pdf'):
                        return jsonify({"error": "Security Error: Malicious or unsupported file type extension detected."}), 400
                        
                    reader = PdfReader(uploaded_file)
                    
                    # Mitigate DoS attacks by capping maximum text mining parsing limits (e.g., max 40 pages)
                    MAX_ALLOWED_PAGES = 40
                    pages_to_read = reader.pages[:MAX_ALLOWED_PAGES]
                    
                    extracted_pages = []
                    for page in pages_to_read:
                        page_text = page.extract_text()
                        if page_text:
                            extracted_pages.append(page_text)
                    text = "\n".join(extracted_pages)
                    
                    # Limit extreme text overflow allocations before shipping data downstream
                    MAX_CHARACTER_LIMIT = 80000
                    if len(text) > MAX_CHARACTER_LIMIT:
                        text = text[:MAX_CHARACTER_LIMIT]
        else:
            data = request.get_json() or {}
            text = data.get("text", "")
            current_context_deck_id = data.get("deck_id")

        if not text or not text.strip():
            return jsonify({"error": "Invalid Data Context: No legible or supported text content found."}), 400

        target_deck = None

        if current_context_deck_id:
            target_deck = Deck.query.get(current_context_deck_id)
            if not target_deck:
                return jsonify({"error": "Target Resource Error: Original study deck was not located."}), 404
        else:
            target_deck = Deck(title=f"AI Generated Deck ({datetime.utcnow().strftime('%H:%M')})")
            db.session.add(target_deck)
            db.session.commit() 

        cards_data = generate_flashcards(text)

        if not cards_data:
            return jsonify({"error": "Generation Fault: Failed to compile card schemas from text content arrays."}), 500

        saved_cards = []
        
        # Mass insertions optimization. We batch all objects to memory, 
        # committing ONCE at the end of the loop frame to bypass engine deadlocks.
        for item in cards_data:
            q_str = item.get("question", "").strip()
            a_str = item.get("answer", "").strip()
            
            # Filter empty structures
            if not q_str or not a_str:
                continue
                
            new_card = Flashcard(
                deck_id=target_deck.id,
                question=q_str,
                answer=a_str
            )
            db.session.add(new_card)
            
        # Commit the transaction safely in a single secure batch frame block
        db.session.commit()

        # Re-query database maps safely to extract auto-assigned IDs for the client payload view
        for card in target_deck.cards:
            saved_cards.append({
                "id": card.id,
                "question": card.question,
                "answer": card.answer
            })

        return jsonify({
            "status": "success",
            "deck_id": target_deck.id,
            "cards": saved_cards
        })

    except Exception as e:
        print("CRITICAL SERVER FAULT INTERCEPTED:", str(e))
        db.session.rollback()
        # Never pass direct string error traces down to the browser console logs
        return jsonify({"error": "An internal system anomaly occurred while processing request records."}), 500

    
@app.route("/decks", methods=["GET"])
def get_decks():
    try:
        all_decks = Deck.query.order_by(Deck.created_at.desc()).all()
        decks_list = [{"id": d.id, "title": d.title} for d in all_decks]
        return jsonify({"decks": decks_list})
    except Exception as e:
        print("SERVER EXCEPTION:", str(e))
        return jsonify({"error": "Failed to compile collection records."}), 500

@app.route("/decks/<int:deck_id>/cards", methods=["GET"])
def get_deck_cards(deck_id):
    try:
        deck = Deck.query.get(deck_id)
        if not deck:
            return jsonify({"error": "Deck target requested not found."}), 404
            
        current_time = datetime.utcnow()
        
        total_cards = len(deck.cards)
        memorized_cards = 0
        due_cards_count = 0
        forgotten_cards_count = 0
        
        cards_list = []
        for c in deck.cards:
            is_due = True
            if c.next_review and c.next_review > current_time:
                is_due = False
                
            if c.interval > 1 and not is_due:
                memorized_cards += 1
            if is_due:
                due_cards_count += 1
            if c.interval == 1 and not is_due and c.next_review:
                forgotten_cards_count += 1
                
            cards_list.append({
                "id": c.id, 
                "question": c.question, 
                "answer": c.answer,
                "interval": c.interval,
                "next_review": c.next_review.isoformat() if c.next_review else None
            })
            
        completion_rate = round((memorized_cards / total_cards) * 100) if total_cards > 0 else 0
        
        return jsonify({
            "cards": cards_list,
            "analytics": {
                "total": total_cards,
                "memorized": memorized_cards,
                "due": due_cards_count,
                "forgotten": forgotten_cards_count,
                "progress_percent": completion_rate
            }
        })
    except Exception as e:
        print("SERVER EXCEPTION:", str(e))
        return jsonify({"error": "Failed to calculate core metric maps."}), 500

@app.route("/flashcards/<int:card_id>", methods=["DELETE"])
def delete_flashcard(card_id):
    try:
        card = Flashcard.query.get(card_id)
        if not card:
            return jsonify({"error": "Flashcard index reference targeted not found."}), 404

        db.session.delete(card)
        db.session.commit()
        return jsonify({"message": "Flashcard tracking node deleted."})
    except Exception as e:
        print("SERVER EXCEPTION:", str(e))
        db.session.rollback()
        return jsonify({"error": "Could not complete drop request operations safely."}), 500
    
@app.route("/flashcards/<int:card_id>/review", methods=["POST"])
def review_flashcard(card_id):
    try:
        data = request.get_json() or {}
        user_status = data.get("status")

        card = Flashcard.query.get(card_id)
        if not card:
            return jsonify({"error": "Flashcard reference missing."}), 404

        if user_status == "correct":
            if card.interval == 1:
                card.interval = 3
            elif card.interval == 3:
                card.interval = 7
            else:
                card.interval = card.interval * 2
        elif user_status == "wrong":
            card.interval = 1

        card.next_review = datetime.utcnow() + timedelta(days=card.interval)
        db.session.commit()

        return jsonify({
            "message": "Review tracked successfully.",
            "next_review_days": card.interval,
            "next_review_timestamp": card.next_review.isoformat()
        })
    except Exception as e:
        print("SERVER EXCEPTION:", str(e))
        db.session.rollback()
        return jsonify({"error": "Failed to update collection matrix variables safely."}), 500

@app.route("/decks/<int:deck_id>/cards/due", methods=["GET"])
def get_due_cards(deck_id):
    try:
        deck = Deck.query.get(deck_id)
        if not deck:
            return jsonify({"error": "Collection targeted not located."}), 404
            
        current_time = datetime.utcnow()
        due_cards = Flashcard.query.filter(
            Flashcard.deck_id == deck_id,
            Flashcard.next_review <= current_time
        ).all()
        
        cards_list = [
            {
                "id": c.id, 
                "question": c.question, 
                "answer": c.answer,
                "interval": c.interval
            } for c in due_cards
        ]
        return jsonify({"cards": cards_list})
    except Exception as e:
        print("SERVER EXCEPTION:", str(e))
        return jsonify({"error": "Could not extract active timeline arrays."}), 500

@app.route("/decks/<int:deck_id>", methods=["DELETE"])
def delete_deck(deck_id):
    try:
        deck = Deck.query.get(deck_id)
        if not deck:
            return jsonify({"error": "Collection node targeted not found."}), 404

        for card in deck.cards:
            db.session.delete(card)

        db.session.delete(deck)
        db.session.commit()
        return jsonify({"message": "Deck target matrix dropped successfully."})
    except Exception as e:
        print("BACKEND DELETION ERROR:", str(e)) 
        db.session.rollback()
        return jsonify({"error": "Could not wipe targeted collection array safely."}), 500

@app.route("/decks/<int:deck_id>", methods=["PUT"])
def rename_deck(deck_id):
    try:
        data = request.get_json() or {}
        new_title = data.get("title")
        
        if not new_title or not new_title.strip():
            return jsonify({"error": "Invalid Inputs: Title formatting limits broken."}), 400

        deck = Deck.query.get(deck_id)
        if not deck:
            return jsonify({"error": "Deck profile targeted not found."}), 404

        deck.title = new_title.strip()
        db.session.commit()
        return jsonify({"message": "Renamed collection target successfully."})
    except Exception as e:
        print("SERVER EXCEPTION:", str(e))
        db.session.rollback()
        return jsonify({"error": "Failed to execute column updates."}), 500

if __name__ == "__main__":
    app.run(debug=False)