async function generate() {
    const textInput = document.getElementById("textInput").value;
    const container = document.getElementById("flashcardContainer");
    const statusDiv = document.getElementById("status");

    container.innerHTML = "";
    if (!textInput.trim()) {
        alert("Please enter some text first!");
        return;
    }

    statusDiv.innerText = "Generating flashcards... please wait... ✨";

    try {
        const response = await fetch("/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: textInput })
        });

        const result = await response.json();

        if (response.ok && result.cards) {
            statusDiv.innerText = `Success! Created ${result.cards.length} cards inside Deck #${result.deck_id}.`;

            let cardHTML = "";

            result.cards.forEach(card => {
                cardHTML += `
                    <div class="flashcard-wrapper" onclick="this.querySelector('.flashcard').classList.toggle('flipped')">
                        <div class="flashcard">
                            <div class="card-face card-front">${card.question}</div>
                            <div class="card-face card-back">${card.answer}</div>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = cardHTML;

        } else {
            statusDiv.innerText = "Error: " + (result.error || "Failed to make cards");
        }
    } catch (error) {
        console.error("Fetch Error:", error);
        statusDiv.innerText = "An error occurred while connecting to the server.";
    }
}