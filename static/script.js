
// This keeps track of which deck we are currently looking at!
// null = We are making a NEW deck. X = We are adding cards to Deck X.
let currentDeckId = null; 

// Automatically load historical decks on page load
window.onload = function() {
    loadSavedDecks();
};

function createNewDeckMode() {
   
    currentDeckId = null;

    document.getElementById("flashcardContainer").innerHTML = "";
    document.getElementById("textInput").value = "";
    document.getElementById("status").innerText = "";
    document.getElementById("deckTitleHeading").innerText = "Generating NEW Deck Studio";
    
    console.log("Context Switched: Generate NEW Deck mode activated.");
}

async function viewDeck(deckId) {
    //  Update tracker to specific ID
    currentDeckId = deckId;
    
    const container = document.getElementById("flashcardContainer");
    const heading = document.getElementById("deckTitleHeading");
    container.innerHTML = "Opening deck content...";
    heading.innerText = `Viewing Deck #${deckId}`;

    console.log(`Context Switched: Viewing Deck ${deckId} mode activated.`);

    try {
        const response = await fetch(`/decks/${deckId}/cards`);
        const data = await response.json();

        if (response.ok && data.cards) {
            // Render these cards, replacing what is on screen
            renderCardsToScreen(data.cards, false);
        } else {
            container.innerHTML = "Could not parse deck cards content.";
        }
    } catch (error) {
        container.innerHTML = "An error occurred while fetching items.";
    }
}

async function generate() {
    const textInput = document.getElementById("textInput").value;
    const container = document.getElementById("flashcardContainer");
    const statusDiv = document.getElementById("status");
    const heading = document.getElementById("deckTitleHeading");

    if (!textInput.trim()) {
        alert("Please enter some text first!");
        return;
    }

    statusDiv.innerText = "Processing text with Gemini AI... please wait... ✨";

    try {
        // Prepare payload including our context tracking variable currentDeckId
        const payload = {
            text: textInput,
            deck_id: currentDeckId // null sends null, ID sends ID
        };

        const response = await fetch("/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok && result.cards) {
            
            // Re-fetch sidebar list just in case we made a new deck
            loadSavedDecks();
            document.getElementById("textInput").value = ""; // Clear input

            // Success feedback behavior changes based on context:
            if (currentDeckId) {
                // Scenario A: Generating into existing deck
                statusDiv.innerText = `Success! Generated ${result.cards.length} NEW cards inside this deck (Deck #${result.deck_id}). Total cards increased.`;
                // Append the cards onto the bottom of the current view
                renderCardsToScreen(result.cards, true);
            } else {
                // Scenario B: Making a brand new deck from scratch
                statusDiv.innerText = `Success! Minted fresh Deck #${result.deck_id}.`;
                heading.innerText = `Viewing Deck #${result.deck_id}`;
                // Set our context to this new deck
                currentDeckId = result.deck_id; 
                // Draw the cards fresh (not append)
                renderCardsToScreen(result.cards, false);
            }

        } else {
            statusDiv.innerText = "Error: " + (result.error || "Failed to make cards");
        }
    } catch (error) {
        console.error("Fetch Error:", error);
        statusDiv.innerText = "An error occurred while connecting to the server.";
    }
}

async function loadSavedDecks() {
    const listContainer = document.getElementById("decksList");
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
                        📁 ${deck.title}
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
    let cardHTML = "";

    cardsArray.forEach(card => {
        cardHTML += `
            <div class="flashcard-wrapper" onclick="this.querySelector('.flashcard').classList.toggle(\'flipped\')">
                <div class="flashcard">
                    <div class="card-face card-front">${card.question}</div>
                    <div class="card-face card-back">${card.answer}</div>
                </div>
            </div>
        `;
    });

    if (append) {
        // Add new cards without deleting what is already on screen
        container.innerHTML += cardHTML;
    } else {
        // Wipe screen, only show new cards
        container.innerHTML = cardHTML;
    }
}