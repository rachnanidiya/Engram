let currentDeckId = null;
let currentStudyMode = "flip";
let loadedCardsCache = [];

window.onload = function () {
  loadSavedDecks();
};

function exportActiveDeck() {
  if (loadedCardsCache.length === 0) {
    alert("There are no cards inside this deck array to export!");
    return;
  }

  const heading = document.getElementById("deckTitleHeading");
  const rawTitle = heading ? heading.innerText : `deck_${currentDeckId}`;
  const sanitizedFileName =
    rawTitle.toLowerCase().replace(/[^a-z0-9]/gi, "_") + "_backup.txt";

  let textContent = `=====================================================\n`;
  textContent += ` RECALL STUDY EXPORT DETAILED SUMMARY NODE\n`;
  textContent += ` Collection Target: ${rawTitle}\n`;
  textContent += ` Total Flashcard Aggregations: ${loadedCardsCache.length}\n`;
  textContent += ` Compiled Timeline: ${new Date().toLocaleString()}\n`;
  textContent += `=====================================================\n\n`;

  loadedCardsCache.forEach((card, index) => {
    textContent += `CARD #${index + 1}\n`;
    textContent += `QUESTION : ${card.question}\n`;
    textContent += `ANSWER   : ${card.answer}\n`;
    textContent += `-----------------------------------------------------\n\n`;
  });

  const blob = new Blob([textContent], { type: "text/plain;charset=utf-8;" });
  const downloadUrl = URL.createObjectURL(blob);
  const hiddenLink = document.createElement("a");

  hiddenLink.href = downloadUrl;
  hiddenLink.setAttribute("download", sanitizedFileName);
  hiddenLink.style.visibility = "hidden";

  document.body.appendChild(hiddenLink);
  hiddenLink.click();
  document.body.removeChild(hiddenLink);
}

function switchStudyMode(selectedMode) {
  currentStudyMode = selectedMode;

  const flipBtn = document.getElementById("modeFlipBtn");
  const quizBtn = document.getElementById("modeQuizBtn");

  if (selectedMode === "quiz") {
    if (quizBtn) quizBtn.classList.add("active");
    if (flipBtn) flipBtn.classList.remove("active");
  } else {
    if (flipBtn) flipBtn.classList.add("active");
    if (quizBtn) quizBtn.classList.remove("active");
  }

  if (loadedCardsCache.length > 0) {
    renderCardsToScreen(loadedCardsCache, false);
  }
}

function evaluateQuizAnswer(event, cardId, rawCorrectAnswer) {
  event.stopPropagation();

  const inputField = document.getElementById(`quiz-input-${cardId}`);
  const wrapper = document.getElementById(`card-box-${cardId}`);
  const innerCard = wrapper ? wrapper.querySelector(".flashcard") : null;
  const banner = document.getElementById(`quiz-banner-${cardId}`);

  if (!inputField || !innerCard || !banner) return;

  const userGuess = inputField.value.trim().toLowerCase();
  const actualAnswer = rawCorrectAnswer.trim().toLowerCase();

  if (userGuess.length === 0) {
    alert("Please type a guess before submitting!");
    return;
  }

  // Tokenize text into descriptive alphabetic keyword sets, discarding filler articles
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "of",
    "in",
    "on",
    "at",
    "by",
    "for",
    "with",
    "to",
    "and",
    "or",
    "that",
    "it",
    "from",
  ]);
  const getKeywords = (str) => {
    return str
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
      .split(/\s+/)
      .filter((word) => word.length > 1 && !stopWords.has(word));
  };

  const userWords = getKeywords(userGuess);
  const actualWords = getKeywords(actualAnswer);

  // Calculate how many of the user's key words exist in the real answer block
  let matchCount = 0;
  userWords.forEach((word) => {
    if (actualAnswer.includes(word)) {
      matchCount++;
    }
  });

  // FIXED VERDICT: If the user provides at least one meaningful word, and has a 45%+ keyword intersection rate
  let isCorrect = false;
  if (userWords.length > 0) {
    const matchRatio = matchCount / userWords.length;
    if (matchRatio >= 0.45 || actualAnswer.includes(userGuess)) {
      isCorrect = true;
    }
  }

  // Assign UI text tokens and dispatch persistence states
  if (isCorrect) {
    banner.innerText = "🏆 CORRECT!";
    banner.className = "quiz-banner-display correct-state";
    sendReview(cardId, "correct");
  } else {
    banner.innerText = "❌ INCORRECT";
    banner.className = "quiz-banner-display wrong-state";
    sendReview(cardId, "wrong");
  }

  innerCard.classList.add("flipped");
}

function resetQuizCardFace(event, cardId) {
  event.stopPropagation();

  const wrapper = document.getElementById(`card-box-${cardId}`);
  const innerCard = wrapper ? wrapper.querySelector(".flashcard") : null;
  const banner = document.getElementById(`quiz-banner-${cardId}`);
  const inputField = document.getElementById(`quiz-input-${cardId}`);

  if (!wrapper || !innerCard) return;

  // Check if the card was successfully evaluated as complete during this view cycle pass
  const wasCorrect = banner && banner.classList.contains("correct-state");

  if (wasCorrect) {
    // If correct: Deactivate the wrapper block matching Flip Mode behavior rules
    innerCard.classList.remove("flipped");
    setTimeout(() => {
      wrapper.style.transition = "opacity 0.4s ease";
      wrapper.style.opacity = "0.22";
      wrapper.style.pointerEvents = "none";
    }, 200);
  } else {
    // If incorrect: Keep card unlocked, spin back to front face, and flush previous typed text values
    innerCard.classList.remove("flipped");
    setTimeout(() => {
      if (inputField) {
        inputField.value = "";
        inputField.style.borderColor = "var(--border)";
      }
      if (banner) {
        banner.innerText = "";
        banner.className = "";
      }
    }, 250);
  }
}

/* ── HANDLE PDF FILE SELECT UI CHANGE ── */
function handleFileSelection() {
  const fileInput = document.getElementById("pdfFileInput");
  const label = document.getElementById("fileSelectedLabel");
  const textInput = document.getElementById("textInput");
  const uploadBtnText = document.getElementById("uploadButtonText");

  if (fileInput && fileInput.files.length > 0) {
    const fileName = fileInput.files[0].name;
    if (label) {
      label.innerText = `📄 ${fileName}`;
      label.style.display = "inline-block";
    }
    if (uploadBtnText) uploadBtnText.innerText = "Change Document";

    if (textInput) {
      textInput.value = "";
      textInput.placeholder =
        "PDF active. Click 'Generate Cards' to begin parsing!";
      textInput.disabled = true;
    }
  }
}

function showLoading(msg) {
  const overlay = document.getElementById("loadingOverlay");
  const subtitle = document.getElementById("loadingSubtitle");
  if (subtitle && msg) subtitle.innerText = msg;
  if (overlay) overlay.classList.add("active");
}

function hideLoading() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.classList.remove("active");
}

function createNewDeckMode() {
  currentDeckId = null;
  loadedCardsCache = [];

  const container = document.getElementById("flashcardContainer");
  const textInput = document.getElementById("textInput");
  const statusDiv = document.getElementById("status");
  const heading = document.getElementById("deckTitleHeading");
  const panel = document.getElementById("analyticsPanel");
  const exportBtn = document.getElementById("exportDeckBtn");
  const exportPdfBtn = document.getElementById("exportPDFBtn");
  if (container) container.innerHTML = "";
  if (textInput) {
    textInput.value = "";
    textInput.placeholder =
      "Paste your notes, textbook excerpts, or any concept text here...";
    textInput.disabled = false;
  }
  if (statusDiv) {
    statusDiv.innerText = "";
    statusDiv.className = "status-msg";
  }
  if (heading) heading.innerText = "AI Flashcard Studio";
  if (panel) panel.style.display = "none";
  if (exportBtn) exportBtn.style.display = "none";

  if (exportPdfBtn) exportPdfBtn.style.display = "none";
}

async function viewDeck(deckId) {
  currentDeckId = deckId;
  const container = document.getElementById("flashcardContainer");
  const heading = document.getElementById("deckTitleHeading");
  const filterCheckbox = document.getElementById("dueFilterCheckbox");
  const exportBtn = document.getElementById("exportDeckBtn");
  const exportPdfBtn = document.getElementById("exportPDFBtn");
  
  if (container) container.innerHTML = "Opening deck content...";
  if (filterCheckbox) filterCheckbox.checked = false;

  document
    .querySelectorAll(".deck-item")
    .forEach((el) => el.classList.remove("active"));
  const activeDeckEl = document.getElementById(`deck-item-${deckId}`);
  if (activeDeckEl) activeDeckEl.classList.add("active");

  try {
    const response = await fetch(`/decks/${deckId}/cards`);
    const data = await response.json();

    if (response.ok && data.cards) {
      const targetRow =
        document.getElementById(`deck-item-${deckId}`) || activeDeckEl;
      if (targetRow && heading) {
        const titleText =
          targetRow.querySelector("span")?.innerText || `Deck #${deckId}`;
        heading.innerText = titleText.replace("📁", "").trim();
      }

      const panel = document.getElementById("analyticsPanel");
      if (data.analytics && panel) {
        panel.style.display = "block";
        document.getElementById("statTotal").innerText = data.analytics.total;
        document.getElementById("statMemorized").innerText =
          data.analytics.memorized;
        document.getElementById("statDue").innerText = data.analytics.due;
        document.getElementById("statForgotten").innerText =
          data.analytics.forgotten;
        document.getElementById("statProgress").innerText =
          `${data.analytics.progress_percent}%`;
      }

      loadedCardsCache = data.cards;

      // FIXED: Safely toggling export buttons AFTER data is guaranteed to exist
      if (exportBtn) {
        exportBtn.style.display = data.cards.length > 0 ? "inline-flex" : "none";
      }
      if (exportPdfBtn) {
        exportPdfBtn.style.display = data.cards.length > 0 ? "inline-flex" : "none";
      }

      renderCardsToScreen(data.cards, false);
    } else {
      if (container)
        container.innerHTML = "Could not parse deck cards content.";
    }
  } catch (error) {
    console.error("View deck error:", error);
    if (container)
      container.innerHTML = "An error occurred while fetching items.";
  }
}

async function generate() {
  const textInput = document.getElementById("textInput");
  const fileInput = document.getElementById("pdfFileInput");
  const btn = document.getElementById("generateBtn");
  const statusDiv = document.getElementById("status");
  const heading = document.getElementById("deckTitleHeading");
  const fileLabel = document.getElementById("fileSelectedLabel");
  const uploadBtnText = document.getElementById("uploadButtonText");
  const exportBtn = document.getElementById("exportDeckBtn");
  const exportPdfBtn = document.getElementById("exportPDFBtn");
  const hasFile = fileInput && fileInput.files.length > 0;
  const hasText = textInput && textInput.value.trim().length > 0;

  if (!hasFile && !hasText) {
    alert("Please enter notes or choose a valid study PDF document first!");
    return;
  }

  if (btn) btn.disabled = true;
  if (textInput) textInput.disabled = true;

  const loadingMessage = hasFile
    ? "Extracting document text layers and modeling card schemas..."
    : "Processing literature arrays with Gemini AI... ✨";
  showLoading(loadingMessage);

  try {
    let response;

    if (hasFile) {
      const formData = new FormData();
      formData.append("file", fileInput.files[0]);
      formData.append("deck_id", currentDeckId);

      response = await fetch("/generate", {
        method: "POST",
        body: formData,
      });
    } else {
      response = await fetch("/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textInput.value, deck_id: currentDeckId }),
      });
    }

    const result = await response.json();

    if (response.ok && result.cards) {
      loadSavedDecks();

      if (fileInput) fileInput.value = "";
      if (fileLabel) fileLabel.style.display = "none";
      if (uploadBtnText) uploadBtnText.innerText = "Upload PDF";
      
      textInput.value = "";
      textInput.placeholder =
        "Paste your notes, textbook excerpts, or any concept text here...";
      textInput.disabled = false;

      if (currentDeckId) {
        if (statusDiv)
          statusDiv.innerText = `Success! Generated ${result.cards.length} new cards inside this deck.`;
        loadedCardsCache = loadedCardsCache.concat(result.cards);
        renderCardsToScreen(result.cards, true);
      } else {
        if (statusDiv)
          statusDiv.innerText = `Success! Minted fresh deck container.`;
        currentDeckId = result.deck_id;

        setTimeout(() => {
          const freshDeckEl = document.getElementById(
            `deck-item-${result.deck_id}`,
          );
          if (heading && freshDeckEl) {
            const titleText =
              freshDeckEl.querySelector("span")?.innerText ||
              `Deck #${result.deck_id}`;
            heading.innerText = titleText.replace("📁", "").trim();
          }
        }, 200);

        loadedCardsCache = result.cards;
        renderCardsToScreen(result.cards, false);
      }

      // Reveal buttons seamlessly on card creation finish
      if (exportBtn) exportBtn.style.display = "inline-flex";
      if (exportPdfBtn) exportPdfBtn.style.display = "inline-flex";
    } else {
      if (statusDiv)
        statusDiv.innerText =
          "Error: " + (result.error || "Failed to make cards");
      if (textInput) textInput.disabled = false;
    }
  } catch (error) {
    if (statusDiv)
      statusDiv.innerText = "An error occurred while connecting to the server.";
    if (textInput) textInput.disabled = false;
  } finally {
    if (btn) btn.disabled = false;
    hideLoading();
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
        listContainer.innerHTML =
          "<div class='deck-loading'>No decks yet. Create one above!</div>";
        return;
      }
      let listHTML = "";
      data.decks.forEach((deck) => {
        listHTML += `
                    <div class="deck-item ${deck.id === currentDeckId ? "active" : ""}" id="deck-item-${deck.id}" onclick="viewDeck(${deck.id})">
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

function renderCardsToScreen(cardsArray, append) {
  const container = document.getElementById("flashcardContainer");
  if (!container) return;

  let cardHTML = "";
  const now = new Date();

  cardsArray.forEach((card) => {
    let startingStyle = "";
    let isDue = true;

    if (card.next_review) {
      const reviewDate = new Date(card.next_review);
      if (reviewDate > now) {
        isDue = false;
      }
    }

    if (!isDue) {
      startingStyle = "style='opacity: 0.22; pointer-events: none;'";
    }

    let dateLabel = "Ready to Review";
    if (card.next_review) {
      const d = new Date(card.next_review);
      dateLabel = d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    }

    const escapedAnswer = card.answer.replace(/"/g, "&quot;");

    if (currentStudyMode === "flip") {
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
    } else if (currentStudyMode === "quiz") {
      cardHTML += `
                <div class="flashcard-wrapper" id="card-box-${card.id}" data-interval="${card.interval || 1}" ${startingStyle}>
                    <div class="flashcard">
                        <div class="card-face card-front spec-quiz-layout" style="justify-content: flex-start;">
                            <span class="due-badge">📝 Quiz Question</span>
                            <button class="delete-btn" onclick="event.stopPropagation(); deleteCard(${card.id})">🗑️</button>
                            
                            <p class="card-question" style="margin-bottom: 14px; margin-top: 18px;">${card.question}</p>
                            
                            <div class="quiz-input-group" style="width: 100%; display: flex; flex-direction: column; gap: 8px; margin-top: auto;" onclick="event.stopPropagation();">
                                <input type="text" id="quiz-input-${card.id}" class="quiz-input-element" placeholder="Type your guess here..." onkeydown="if(event.key==='Enter') evaluateQuizAnswer(event, ${card.id}, '${escapedAnswer}')">
                                <button onclick="evaluateQuizAnswer(event, ${card.id}, '${escapedAnswer}')" class="btn-action-static" style="background: var(--accent); color: #fff; border: none; width: 100%; padding: 10px; font-weight:600; border-radius: var(--radius-sm); cursor: pointer;">Submit Answer</button>
                            </div>
                        </div>
                        
                        <div class="card-face card-back" style="justify-content: flex-start; padding-top: 48px;">
                            <div id="quiz-banner-${card.id}"></div>
                            <button class="delete-btn" onclick="event.stopPropagation(); deleteCard(${card.id})">🗑️</button>
                            
                            <div class="card-answer-text" style="margin-top: 6px; margin-bottom: 12px;">${card.answer}</div>
                            
                            <button onclick="resetQuizCardFace(event, ${card.id})" class="quiz-try-again-btn">
                                ← Try Next Card
                            </button>
                        </div>
                    </div>
                </div>
            `;
    }
  });

  if (append) {
    container.innerHTML += cardHTML;
  } else {
    container.innerHTML = cardHTML;
  }
}

function filterCardsOnScreen() {
  const isChecked = document.getElementById("dueFilterCheckbox").checked;
  document.querySelectorAll(".flashcard-wrapper").forEach((box) => {
    const interval = parseInt(box.getAttribute("data-interval"));
    box.style.display = isChecked && interval > 1 ? "none" : "";
  });
}

async function sendReview(cardId, userStatus) {
  const cardVisualBox = document.getElementById(`card-box-${cardId}`);
  try {
    const response = await fetch(`/flashcards/${cardId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: userStatus }),
    });
    if (response.ok) {
      if (cardVisualBox) {
        if (currentStudyMode === "flip") {
          cardVisualBox.style.opacity = "0.22";
          cardVisualBox.style.pointerEvents = "none";
        }

        if (userStatus === "correct") {
          cardVisualBox.setAttribute("data-interval", "3");
        } else if (userStatus === "wrong") {
          cardVisualBox.setAttribute("data-interval", "1");
        }

        if (currentDeckId) {
          refreshAnalyticsSilently(currentDeckId);
        }
      }
    }
  } catch (error) {
    console.error("Review sync fault:", error);
  }
}

async function refreshAnalyticsSilently(deckId) {
  try {
    const response = await fetch(`/decks/${deckId}/cards`);
    const data = await response.json();
    if (response.ok && data.analytics) {
      document.getElementById("statTotal").innerText = data.analytics.total;
      document.getElementById("statMemorized").innerText =
        data.analytics.memorized;
      document.getElementById("statDue").innerText = data.analytics.due;
      document.getElementById("statForgotten").innerText =
        data.analytics.forgotten;
      document.getElementById("statProgress").innerText =
        `${data.analytics.progress_percent}%`;
    }
  } catch (e) {
    console.error("Analytics silently drop check sync fault:", e);
  }
}

async function deleteCard(cardId) {
  if (!confirm("Are you sure you want to delete this flashcard permanently?"))
    return;
  const cardVisualBox = document.getElementById(`card-box-${cardId}`);
  try {
    const response = await fetch(`/flashcards/${cardId}`, { method: "DELETE" });
    if (response.ok && cardVisualBox) {
      cardVisualBox.remove();
      if (currentDeckId) refreshAnalyticsSilently(currentDeckId);
    }
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
    body: JSON.stringify({ title: newTitle.trim() }),
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
async function exportActiveDeckAsPDF() {
  if (loadedCardsCache.length === 0) {
    alert("There are no cards inside this deck array to export!");
    return;
  }

  const heading = document.getElementById("deckTitleHeading");
  const rawTitle = heading ? heading.innerText : `deck_${currentDeckId}`;
  const sanitizedFileName =
    rawTitle.toLowerCase().replace(/[^a-z0-9]/gi, "_") + "_backup.pdf";

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let currentYOffset = 20;

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(20);
  doc.text("RECALL DECK EXPORT SHEET", 20, currentYOffset);

  currentYOffset += 10;
  doc.setFontSize(11);
  doc.setFont("Helvetica", "normal");
  doc.text(`Collection Title: ${rawTitle}`, 20, currentYOffset);
  doc.text(
    `Total Aggregations: ${loadedCardsCache.length} Flashcards`,
    20,
    currentYOffset + 6,
  );
  doc.text(
    `Compiled Timeline: ${new Date().toLocaleString()}`,
    20,
    currentYOffset + 12,
  );

  currentYOffset += 24;
  doc.setDrawColor(200, 200, 200);
  doc.line(20, currentYOffset, 190, currentYOffset);
  currentYOffset += 15;

  loadedCardsCache.forEach((card, index) => {
    // Prevent printing text cutoff side-effects by checking viewport canvas boundaries page limits
    if (currentYOffset > 260) {
      doc.addPage();
      currentYOffset = 20;
    }

    doc.setFont("Helvetica", "bold");
    doc.text(`CARD #${index + 1}`, 20, currentYOffset);
    currentYOffset += 8;

    doc.setFont("Helvetica", "bold");
    doc.text("Q: ", 20, currentYOffset);
    doc.setFont("Helvetica", "normal");
    // Split text blocks into standard pixel layout bounds lengths
    let splitQuestion = doc.splitTextToSize(card.question, 160);
    doc.text(splitQuestion, 26, currentYOffset);
    currentYOffset += splitQuestion.length * 6 + 4;

    doc.setFont("Helvetica", "bold");
    doc.text("A: ", 20, currentYOffset);
    doc.setFont("Helvetica", "normal");
    let splitAnswer = doc.splitTextToSize(card.answer, 160);
    doc.text(splitAnswer, 26, currentYOffset);
    currentYOffset += splitAnswer.length * 6 + 14;
  });

  // Execute Native OS download attachment write stream hook
  doc.save(sanitizedFileName);
}
