from datetime import datetime, timedelta
import os
import json
from flask import redirect, url_for
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from flask import Flask, request, jsonify, render_template
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
from google import genai
from pypdf import PdfReader
from models import db, Flashcard, Deck, User, StudyLog

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("CRITICAL CONFIGURATION ERROR: GEMINI_API_KEY is missing from host variables.")

client = genai.Client(api_key=api_key)

app = Flask(__name__)

# Secret key required by Flask-Login to sign session cookies securely
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "change-this-to-a-secure-random-string-later")

# Set up the Flask-Login manager framework
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "auth_page"  # Redirects logged-out users here

# User Loader: Tells Flask-Login how to look up a user by their database ID
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Explicitly restrict global upload file stream payloads to prevent Memory DoS attacks
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # Strict 16MB file threshold ceiling



BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DEFAULT_DB_PATH = f"sqlite:///{os.path.join(BASE_DIR, 'flashcards.db')}"

app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL", DEFAULT_DB_PATH)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db.init_app(app)

with app.app_context():
    db.create_all()

#Serves the login/signup form template
@app.route("/auth")
def auth_page():
    if current_user.is_authenticated:
        return redirect(url_for("home"))
    return render_template("auth.html")

#Handles User Registration / Sign-Up
@app.route("/register", methods=["POST"])
def register():
    try:  
        data = request.get_json() or {}
        username = data.get("username", "").strip()
        password = data.get("password", "").strip()

        if not username or not password:
            return jsonify({"error": "Validation Error: Username and password cannot be blank."}), 400

        existing_user = User.query.filter_by(username=username).first()
        if existing_user:
            return jsonify({"error": "Registration Error: This username is already taken."}), 400

        hashed_password = generate_password_hash(password, method="pbkdf2:sha256")
        
        new_user = User(username=username, password=hashed_password)
        db.session.add(new_user)
        db.session.commit()

        login_user(new_user)
        return jsonify({"status": "success", "message": "Account created successfully!"})

    except Exception as e:  
        print("REGISTRATION FAULT:", str(e))
        db.session.rollback()
        return jsonify({"error": "An error occurred during account creation."}), 500

#Handles User Login
@app.route("/login", methods=["POST"])
def login():
    try:
        data = request.get_json() or {}
        username = data.get("username", "").strip()
        password = data.get("password", "").strip()

        user = User.query.filter_by(username=username).first()
        
        if not user or not check_password_hash(user.password, password):
            return jsonify({"error": "Authentication Error: Incorrect username or password."}), 401

        login_user(user)
        return jsonify({"status": "success", "message": "Logged in successfully!"})
    except Exception as e:
        print("LOGIN FAULT:", str(e))
        return jsonify({"error": "An error occurred during authentication."}), 500

# Logs out the user
@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("auth_page"))

@app.route("/")
@login_required
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
        cards_data = json.loads(clean_text)
        
        # Ensure the LLM structural response is explicitly a list array block
        if not isinstance(cards_data, list):
            return []
        return cards_data
    except Exception as e:
        print("SECURE SERVER LOG [Gemini Fault]:", str(e))
        return []

# Generates flashcard instances linked securely to the active logged-in User profile ID
@app.route("/generate", methods=["POST"])
@login_required
def generate():
    try:
        text = ""
        current_context_deck_id = None
        MAX_CHARACTER_LIMIT = 80000

        # Multipart file parsing pipeline
        if request.content_type and "multipart/form-data" in request.content_type:
            raw_deck_id = request.form.get("deck_id")
            
            if raw_deck_id and raw_deck_id != "null" and raw_deck_id.strip() != "":
                try:
                    current_context_deck_id = int(raw_deck_id)
                except ValueError:
                    return jsonify({"error": "Invalid Data: Provided deck_id must be an integer index."}), 400

            if "file" in request.files:
                uploaded_file = request.files["file"]
                if uploaded_file.filename != "":
                    if not uploaded_file.filename.lower().endswith('.pdf'):
                        return jsonify({"error": "Security Error: Unsupported file type extension detected."}), 400
                        
                    reader = PdfReader(uploaded_file)
                    MAX_ALLOWED_PAGES = 40
                    pages_to_read = reader.pages[:MAX_ALLOWED_PAGES]
                    
                    extracted_pages = []
                    for page in pages_to_read:
                        page_text = page.extract_text()
                        if page_text:
                            extracted_pages.append(page_text)
                    text = "\n".join(extracted_pages)

        # Typed text payload parsing pipeline
        else:
            data = request.get_json() or {}
            text = data.get("text", "")
            raw_deck_id = data.get("deck_id")
            
            if raw_deck_id and raw_deck_id != "null":
                try:
                    current_context_deck_id = int(raw_deck_id)
                except ValueError:
                    return jsonify({"error": "Invalid Data: Provided deck_id must be an integer index."}), 400

        if not text or not text.strip():
            return jsonify({"error": "Invalid Data Context: No legible or supported text content found."}), 400

        if len(text) > MAX_CHARACTER_LIMIT:
            text = text[:MAX_CHARACTER_LIMIT]

        target_deck = None
        is_new_deck = False

        if current_context_deck_id:
            #Ensure the deck exists AND belongs specifically to the active current user
            target_deck = Deck.query.filter_by(id=current_context_deck_id, user_id=current_user.id).first()
            if not target_deck:
                return jsonify({"error": "Access Denied: Study deck not located or permissions mismatched."}), 403
        else:
            # Create a brand new workspace folder explicitly containing the current user's owner ID tag
            target_deck = Deck(
                title=f"AI Generated Deck ({datetime.utcnow().strftime('%H:%M')})",
                user_id=current_user.id
            )
            db.session.add(target_deck)
            is_new_deck = True

        cards_data = generate_flashcards(text)

        if not cards_data:
            if is_new_deck:
                db.session.expunge(target_deck)
            return jsonify({"error": "Generation Fault: Failed to compile card schemas from text content arrays."}), 500

        newly_created_cards = []
        
        for item in cards_data:
            q_str = item.get("question", "").strip()
            a_str = item.get("answer", "").strip()
            
            if not q_str or not a_str:
                continue
                
            new_card = Flashcard(
                deck=target_deck,
                question=q_str,
                answer=a_str
            )
            db.session.add(new_card)
            newly_created_cards.append(new_card)
            
        db.session.commit()

        saved_cards = [{
            "id": card.id,
            "question": card.question,
            "answer": card.answer
        } for card in newly_created_cards]

        return jsonify({
            "status": "success",
            "deck_id": target_deck.id,
            "cards": saved_cards
        })

    except Exception as e:
        print("CRITICAL SERVER FAULT INTERCEPTED:", str(e))
        db.session.rollback()
        return jsonify({"error": "An internal system anomaly occurred while processing request records."}), 500
    
@app.route("/decks", methods=["GET"])
@login_required
def get_decks():
    try:
        user_decks = Deck.query.filter_by(user_id=current_user.id).order_by(Deck.created_at.desc()).all()
        decks_list = [{"id": d.id, "title": d.title} for d in user_decks]
        return jsonify({"decks": decks_list})
    except Exception as e:
        print("SERVER EXCEPTION:", str(e))
        return jsonify({"error": "Failed to compile collection records."}), 500

@app.route("/decks/<int:deck_id>/cards", methods=["GET"])
@login_required
def get_deck_cards(deck_id):
    try:
        deck = Deck.query.filter_by(id=deck_id, user_id=current_user.id).first()
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
@login_required
def delete_flashcard(card_id):
    try:
        card = Flashcard.query.get(card_id)
        if not card:
            return jsonify({"error": "Flashcard index reference targeted not found."}), 404
        #Enforce that the parent deck belongs to the current user
        if card.deck.user_id != current_user.id:
            return jsonify({"error": "Access Denied: Permissions mismatched."}), 403
        db.session.delete(card)
        db.session.commit()
        return jsonify({"message": "Flashcard tracking node deleted."})
    except Exception as e:
        print("SERVER EXCEPTION:", str(e))
        db.session.rollback()
        return jsonify({"error": "Could not complete drop request operations safely."}), 500
    
@app.route("/flashcards/<int:card_id>/review", methods=["POST"])
@login_required
def review_flashcard(card_id):
    try:
        data = request.get_json() or {}
        user_status = data.get("status")

        # Enforce validation to reject typos or corrupt status string updates
        if user_status not in ["correct", "wrong"]:
            return jsonify({"error": "Invalid Action payload status parameter. Expected 'correct' or 'wrong'."}), 400

        card = Flashcard.query.get(card_id)
        if not card:
            return jsonify({"error": "Flashcard reference missing."}), 404

        # Enforce ownership structure verification
        if card.deck.user_id != current_user.id:
            return jsonify({"error": "Access Denied: Permissions mismatched."}), 403
        if user_status == "correct":
            if card.interval == 1:
                card.interval = 3
            elif card.interval == 3:
                card.interval = 7
            else:
                card.interval = card.interval * 2
        elif user_status == "wrong":
            card.interval = 1

        log_entry = StudyLog(
            user_id=current_user.id,
            deck_id=card.deck_id,
            status=user_status
        )
        db.session.add(log_entry)
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
@login_required
def get_due_cards(deck_id):
    try:
        deck = Deck.query.filter_by(id=deck_id, user_id=current_user.id).first()
        if not deck:
            return jsonify({"error": "Collection targeted not located."}), 404
            
        current_time = datetime.utcnow()
        
        # Add explicit OR condition to match unreviewed NULL dates seamlessly inside the filter query
        due_cards = Flashcard.query.filter(
            Flashcard.deck_id == deck_id,
            db.or_(Flashcard.next_review == None, Flashcard.next_review <= current_time)
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
@login_required
def delete_deck(deck_id):
    try:
        deck = Deck.query.filter_by(id=deck_id, user_id=current_user.id).first()
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
@login_required
def rename_deck(deck_id):
    try:
        data = request.get_json() or {}
        new_title = data.get("title")
        
        if not new_title or not new_title.strip():
            return jsonify({"error": "Invalid Inputs: Title formatting limits broken."}), 400

        deck = Deck.query.filter_by(id=deck_id, user_id=current_user.id).first()
        if not deck:
            return jsonify({"error": "Deck profile targeted not found."}), 404

        deck.title = new_title.strip()
        db.session.commit()
        return jsonify({"message": "Renamed collection target successfully."})
    except Exception as e:
        print("SERVER EXCEPTION:", str(e))
        db.session.rollback()
        return jsonify({"error": "Failed to execute column updates."}), 500

@app.route("/api/analytics/profile", methods=["GET"])
@login_required
def get_profile_analytics():
    try:
        from models import StudyLog, Deck, Flashcard
        from sqlalchemy import func
        
        now = datetime.utcnow()
        seven_days_ago = now - timedelta(days=7)
        
        # Total lifetime counts
        total_decks = Deck.query.filter_by(user_id=current_user.id).count()
        
        # Grab all review logs for this user in the past week
        logs = StudyLog.query.filter(
            StudyLog.user_id == current_user.id,
            StudyLog.reviewed_at >= seven_days_ago
        ).order_by(StudyLog.reviewed_at.asc()).all()
        
        # Calculate Daily Review Activities for Charting Maps
        chart_data = {}
        for i in range(7):
            day_label = (now - timedelta(days=i)).strftime("%b %d")
            chart_data[day_label] = {"correct": 0, "wrong": 0}
            
        for log in logs:
            day_label = log.reviewed_at.strftime("%b %d")
            if day_label in chart_data:
                chart_data[day_label][log.status] += 1
                
        # Compute Current Consecutive Day Study Streak
        all_review_dates = db.session.query(
            func.date(StudyLog.reviewed_at)
        ).filter(StudyLog.user_id == current_user.id).distinct().order_by(func.date(StudyLog.reviewed_at).desc()).all()
        
        streak = 0
        today_date = now.date()
        expected_date = today_date
        
        # Loop backwards through unique study dates to check if the sequence is broken
        for date_entry in all_review_dates:
            log_date = datetime.strptime(date_entry[0], "%Y-%m-%d").date()
            if log_date == expected_date:
                streak += 1
                expected_date -= timedelta(days=1)
            elif log_date == today_date - timedelta(days=1) and streak == 0:
                # If they haven't studied today yet, check if they studied yesterday to keep the streak alive
                streak = 1
                expected_date = log_date - timedelta(days=1)
            else:
                break

        return jsonify({
            "total_decks": total_decks,
            "streak": streak,
            "chart": [{"day": k, "correct": v["correct"], "wrong": v["wrong"]} for k, v in reversed(chart_data.items())]
        })
    except Exception as e:
        print("PROFILE ANALYTICS FAULT:", str(e))
        return jsonify({"error": "Failed to compile user profile stats matrix."}), 500

if __name__ == "__main__":
    app.run(debug=False)