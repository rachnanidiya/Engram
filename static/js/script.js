let currentDeckId = null;

window.onload = function() {
    loadSavedDecks();
};

function createNewDeckMode() {
    currentDeckId = null;
    
    const container = document.getElementById("flashcardContainer");
    const textInput = document.getElementById("textInput");
    const statusDiv = document.getElementById("status");
    const heading = document.getElementById("deckTitleHeading");
    const filterContainer = document.getElementById("filterContainer");

    if (container) container.innerHTML = "";
    if (textInput) textInput.value = "";
    if (statusDiv) statusDiv.innerText = "";
    if (heading) heading.innerText = "Generating NEW Deck Studio";
    if (filterContainer) filterContainer.style.display = "none";
}

async function viewDeck(deckId) {
    currentDeckId = deckId;
    const container = document.getElementById("flashcardContainer");
    const heading = document.getElementById("deckTitleHeading");
    const filterCheckbox = document.getElementById("dueFilterCheckbox");
    const filterContainer = document.getElementById("filterContainer");
    
    if (container) container.innerHTML = "Opening deck content...";
    if (heading) heading.innerText = `Viewing Deck #${deckId}`;

    if (filterCheckbox) filterCheckbox.checked = false;
    if (filterContainer) filterContainer.style.display = "block";

    try {
        const response = await fetch(`/decks/${deckId}/cards`);
        const data = await response.json();
        if (response.ok && data.cards) {
            renderCardsToScreen(data.cards, false);
        } else {
            if (container) container.innerHTML = "Could not parse deck cards content.";
        }
    } catch (error) {
        if (container) container.innerHTML = "An error occurred while fetching items.";
    }
}

async function generate() {
    const textInput = document.getElementById("textInput").value;
    const container = document.getElementById("flashcardContainer");
    const statusDiv = document.getElementById("status");
    const heading = document.getElementById("deckTitleHeading");
    const filterContainer = document.getElementById("filterContainer");

    if (!textInput.trim()) {
        alert("Please enter some text first!");
        return;
    }

    if (statusDiv) statusDiv.innerText = "Processing text with Gemini AI... please wait... ✨";

    try {
        const payload = { text: textInput, deck_id: currentDeckId };
        const response = await fetch("/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok && result.cards) {
            loadSavedDecks();
            document.getElementById("textInput").value = "";

            if (currentDeckId) {
                if (statusDiv) statusDiv.innerText = `Success! Generated ${result.cards.length} NEW cards inside this deck.`;
                renderCardsToScreen(result.cards, true);
            } else {
                if (statusDiv) statusDiv.innerText = `Success! Minted fresh Deck #${result.deck_id}.`;
                if (heading) heading.innerText = `Viewing Deck #${result.deck_id}`;
                currentDeckId = result.deck_id;
                if (filterContainer) filterContainer.style.display = "block";
                renderCardsToScreen(result.cards, false);
            }
        } else {
            if (statusDiv) statusDiv.innerText = "Error: " + (result.error || "Failed to make cards");
        }
    } catch (error) {
        if (statusDiv) statusDiv.innerText = "An error occurred while connecting to the server.";
    }
}

async function loadSavedDecks() {
    const listContainer = document.getElementById("decksList");
    if (!listContainer) return;

    try {
        const response = await fetch("/decks");
        const data = await response.json();
        if (response.ok && data.decks) {
            if (data.decks.length === 0) {
                listContainer.innerHTML = "<p style='color: #bdc3c7; font-size: 14px;'>No saves.</p>";
                return;
            }
            let listHTML = "";
           data.decks.forEach(deck => {
                listHTML += `
                    <div class="deck-item" onclick="viewDeck(${deck.id})">
                        <span>📁 ${deck.title}</span>
                        <div class="deck-controls">
                            <button class="deck-action-btn" onclick="event.stopPropagation(); renameDeck(${deck.id}, '${deck.title}')">✏️</button>
                            <button class="deck-action-btn" onclick="event.stopPropagation(); deleteDeck(${deck.id})">🗑️</button>
                        </div>
                    </div>
                `;
            });
            listContainer.innerHTML = listHTML;
        }
    } catch (error) {
        console.error("Historical fetch error:", error);
    }
}

function renderCardsToScreen(cardsArray, append) {
    const container = document.getElementById("flashcardContainer");
    if (!container) return;
    
    let cardHTML = "";
    const now = new Date();

    cardsArray.forEach(card => {
        let startingStyle = "";
        let isDue = true;

        if (card.next_review) {
            const reviewDate = new Date(card.next_review);
            if (reviewDate > now) {
                isDue = false;
            }
        }

        if (card.interval > 1 && !isDue) {
            startingStyle = "style='opacity: 0.2; pointer-events: none;'";
        }

        // Format the date label nicely (e.g., "📅 Jun 15")
        let dateLabel = "Ready";
        if (card.next_review) {
            const d = new Date(card.next_review);
            dateLabel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }

        cardHTML += `
            <div class="flashcard-wrapper" id="card-box-${card.id}" data-interval="${card.interval || 1}" ${startingStyle} onclick="this.querySelector('.flashcard').classList.toggle('flipped')">
                <div class="flashcard">
                    
                    <div class="card-face card-front">
                        <span class="due-badge">📅 ${dateLabel}</span>
                        
                        <button class="delete-btn" onclick="event.stopPropagation(); deleteCard(${card.id})">🗑️</button>
                        <div style="margin-top: 20px;">${card.question}</div>
                    </div>
                    
                    <div class="card-face card-back">
                        <p class="card-answer-text">${card.answer}</p>
                        
                        <div class="action-tray">
                            <button class="btn-action btn-forgot" onclick="event.stopPropagation(); sendReview(${card.id}, 'wrong')">❌ Forgot</button>
                            <button class="btn-action btn-knew" onclick="event.stopPropagation(); sendReview(${card.id}, 'correct')">✅ Knew It</button>
                        </div>
                    </div>

                </div>
            </div>
        `;
    });

    if (append) {
        container.innerHTML += cardHTML;
    } else {
        container.innerHTML = cardHTML;
    }
}

function filterCardsOnScreen() {
    const isChecked = document.getElementById("dueFilterCheckbox").checked;
    const cardBoxes = document.querySelectorAll(".flashcard-wrapper");

    cardBoxes.forEach(box => {
        const interval = parseInt(box.getAttribute("data-interval"));
        if (isChecked && interval > 1) {
            box.style.display = "none";
        } else {
            box.style.display = "block";
        }
    });
}

async function sendReview(cardId, userStatus) {
    const cardVisualBox = document.getElementById(`card-box-${cardId}`);
    try {
        const response = await fetch(`/flashcards/${cardId}/review`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: userStatus })
        });
        if (response.ok) {
            if (cardVisualBox) {
                cardVisualBox.style.opacity = "0.2";
                cardVisualBox.style.pointerEvents = "none";
                if (userStatus === "correct") {
                    cardVisualBox.setAttribute("data-interval", "3");
                }
            }
        }
    } catch (error) {
        console.error("Could not connect to backend server:", error);
    }
}

async function deleteCard(cardId) {
    if (!confirm("Are you sure you want to delete this flashcard permanently?")) return;
    const cardVisualBox = document.getElementById(`card-box-${cardId}`);
    try {
        const response = await fetch(`/flashcards/${cardId}`, { method: "DELETE" });
        if (response.ok) {
            if (cardVisualBox) cardVisualBox.remove();
        }
    } catch (error) {
        console.error("Network connectivity fault:", error);
    }
}

// Short, clean function to handle folder renaming
async function renameDeck(deckId, oldTitle) {
    const newTitle = prompt("Enter a new title for this deck:", oldTitle);
    if (!newTitle || !newTitle.trim()) return;

    const response = await fetch(`/decks/${deckId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() })
    });

    if (response.ok) {
        loadSavedDecks(); // Refresh the sidebar text labels instantly
        document.getElementById("deckTitleHeading").innerText = `Viewing Deck: ${newTitle.trim()}`;
    }
}

// Short, clean function to handle folder deletion
async function deleteDeck(deckId) {
    if (!confirm("Delete this entire deck permanently?")) return;

    const response = await fetch(`/decks/${deckId}`, {
        method: "DELETE"
    });

    if (response.ok) {
        loadSavedDecks(); // Refresh the sidebar list immediately
        createNewDeckMode(); // Reset workspace view to fresh state
    }
}