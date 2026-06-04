from flask import Flask
from models import db

app = Flask(__name__)

# Database config
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///flashcards.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)

@app.route("/")
def home():
    return "Flashcard AI is running!"

if __name__ == "__main__":
    with app.app_context():
        db.create_all()   # creates database tables
    app.run(debug=True)