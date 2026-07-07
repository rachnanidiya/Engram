from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from flask_login import UserMixin

db = SQLAlchemy()

class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), unique=True, nullable=False)
    password = db.Column(db.String(256), nullable=False)
    #establish a relationship between user and its multiple decks
    decks = db.relationship('Deck', backref='owner', lazy=True)
class Deck(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
    # Delete cards automatically if the parent deck is deleted
    cards = db.relationship('Flashcard', backref='deck', cascade="all, delete-orphan", lazy=True)
    # This sets up a relationship so a deck can easily look up its cards
    cards = db.relationship('Flashcard', backref='deck', lazy=True)

class Flashcard(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    
    # This links the flashcard directly to a specific Deck's ID
    deck_id = db.Column(db.Integer, db.ForeignKey('deck.id'), nullable=False)

    question = db.Column(db.Text, nullable=False)
    answer = db.Column(db.Text, nullable=False)

    ease = db.Column(db.Float, default=2.5)
    interval = db.Column(db.Integer, default=1)
    next_review = db.Column(db.DateTime, default=datetime.utcnow)