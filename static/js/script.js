let currentDeckId = null;

window.onload = function() {
    loadSavedDecks();
};

/* ── DECK MODE RESET ── */
function createNewDeckMode() {
    currentDeckId = null;
    
    const container = document.getElementById("flashcardContainer");
    const textInput = document.getElementById("textInput");
    const statusDiv = document.getElementById("status");
    const heading = document.getElementById("deckTitleHeading");

    if (container) container.innerHTML = "";
    if (textInput) {
        textInput.value = "";
        textInput.disabled = false;
    }
    if (statusDiv) {
        statusDiv.innerText = "";
        statusDiv.className = "status-msg";
    }
    if (heading) heading.innerText = "AI Flashcard Studio";
}

/* ── VIEW A DECK CONTENT ── */
async function viewDeck(deckId) {
    currentDeckId = deckId;
    const container = document.getElementById("flashcardContainer");
    const heading = document.getElementById("deckTitleHeading");
    const filterCheckbox = document.getElementById("dueFilterCheckbox");
    
    if (container) container.innerHTML = "Opening deck content...";
    if (filterCheckbox) filterCheckbox.checked = false;

    // Highlight active deck element row inside sidebar tracking feed
    document.querySelectorAll(".deck-item").forEach(el => el.classList.remove("active"));
    const activeDeckEl = document.getElementById(`deck-item-${deckId}`);
    if (activeDeckEl) activeDeckEl.classList.add("active");

    try {
        const response = await fetch(`/decks/${deckId}/cards`);
        const data = await response.json();
        if (response.ok && data.cards) {
            const targetRow = document.getElementById(`deck-item-${deckId}`) || activeDeckEl;
            if (targetRow && heading) {
                const titleText = targetRow.querySelector("span")?.innerText || `Deck #${deckId}`;
                heading.innerText = titleText.replace("📁", "").trim();
            } else if (heading) {
                heading.innerText = `Deck #${deckId}`;
            }

            renderCardsToScreen(data.cards, false);
        } else {
            if (container) container.innerHTML = "Could not parse deck cards content.";
        }
    } catch (error) {
        if (container) container.innerHTML = "An error occurred while fetching items.";
    }
}

/* ── GENERATE CARDS LOOP ── */
async function generate() {
    const textInput = document.getElementById("textInput");
    const btn = document.getElementById("generateBtn");
    const statusDiv = document.getElementById("status");
    const heading = document.getElementById("deckTitleHeading");

    if (!textInput || !textInput.value.trim()) {
        alert("Please enter some text notes first!");
        return;
    }

    if (btn) btn.disabled = true;
    if (textInput) textInput.disabled = true;
    if (statusDiv) statusDiv.innerText = "Generating flashcards with Gemini AI… ✨";

    try {
        const payload = { text: textInput.value, deck_id: currentDeckId };
        const response = await fetch("/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok && result.cards) {
            loadSavedDecks();
            
            textInput.value = "";
            textInput.disabled = false;

            if (currentDeckId) {
                if (statusDiv) statusDiv.innerText = `Success! Generated ${result.cards.length} new cards inside this deck.`;
                renderCardsToScreen(result.cards, true);
            } else {
                if (statusDiv) statusDiv.innerText = `Success! Minted fresh deck container.`;
                currentDeckId = result.deck_id;
                
                setTimeout(() => {
                    const freshDeckEl = document.getElementById(`deck-item-${result.deck_id}`);
                    if (heading && freshDeckEl) {
                        const titleText = freshDeckEl.querySelector("span")?.innerText || `Deck #${result.deck_id}`;
                        heading.innerText = titleText.replace("📁", "").trim();
                    }
                }, 200);

                renderCardsToScreen(result.cards, false);
            }
        } else {
            if (statusDiv) statusDiv.innerText = "Error: " + (result.error || "Failed to make cards");
            if (textInput) textInput.disabled = false;
        }
    } catch (error) {
        if (statusDiv) statusDiv.innerText = "An error occurred while connecting to the server.";
        if (textInput) textInput.disabled = false;
    } finally {
        if (btn) btn.disabled = false;
    }
}

/* ── SIDEBAR DATA RETRIEVAL ── */
async function loadSavedDecks() {
    const listContainer = document.getElementById("decksList");
    if (!listContainer) return;

    try {
        const response = await fetch("/decks");
        const data = await response.json();
        if (response.ok && data.decks) {
            if (data.decks.length === 0) {
                listContainer.innerHTML = "<div class='deck-loading'>No decks yet. Create one above!</div>";
                return;
            }
            let listHTML = "";
            data.decks.forEach(deck => {
                listHTML += `
                    <div class="deck-item ${deck.id === currentDeckId ? 'active' : ''}" id="deck-item-${deck.id}" onclick="viewDeck(${deck.id})">
                        <span>📁 ${deck.title}</span>
                        <div class="deck-controls">
                            <button class="deck-action-btn" onclick="event.stopPropagation(); renameDeck(${deck.id}, '${deck.title}')" title="Rename">✏️</button>
                            <button class="deck-action-btn" onclick="event.stopPropagation(); deleteDeck(${deck.id})" title="Delete">🗑️</button>
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

/* ── RENDER FLASHCARDS TO CANVAS ── */
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
            startingStyle = "style='opacity: 0.22; pointer-events: none;'";
        }

        let dateLabel = "Ready to Review";
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
                        <p class="card-question">${card.question}</p>
                    </div>
                    <div class="card-face card-back">
                        <div class="card-answer-text">${card.answer}</div>
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
    document.querySelectorAll(".flashcard-wrapper").forEach(box => {
        const interval = parseInt(box.getAttribute("data-interval"));
        box.style.display = (isChecked && interval > 1) ? "none" : "";
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
                cardVisualBox.style.opacity = "0.22";
                cardVisualBox.style.pointerEvents = "none";
                if (userStatus === "correct") {
                    cardVisualBox.setAttribute("data-interval", "3");
                }
            }
        }
    } catch (error) {
        console.error("Review sync fault:", error);
    }
}

async function deleteCard(cardId) {
    if (!confirm("Are you sure you want to delete this flashcard permanently?")) return;
    const cardVisualBox = document.getElementById(`card-box-${cardId}`);
    try {
        const response = await fetch(`/flashcards/${cardId}`, { method: "DELETE" });
        if (response.ok && cardVisualBox) cardVisualBox.remove();
    } catch (error) {
        console.error("Card drop sync fault:", error);
    }
}

async function renameDeck(deckId, oldTitle) {
    const newTitle = prompt("Enter a new title for this deck:", oldTitle);
    if (!newTitle || !newTitle.trim()) return;

    const response = await fetch(`/decks/${deckId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() })
    });

    if (response.ok) {
        loadSavedDecks();
        document.getElementById("deckTitleHeading").innerText = newTitle.trim();
    }
}

async function deleteDeck(deckId) {
    if (!confirm("Delete this entire deck permanently?")) return;
    const response = await fetch(`/decks/${deckId}`, { method: "DELETE" });
    if (response.ok) {
        loadSavedDecks();
        createNewDeckMode();
    }
}