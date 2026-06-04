function generate() {
    const text = document.getElementById("textInput").value;

    console.log("Sending:", text);

    fetch("/generate", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: text })
    })
    .then(res => res.json())
    .then(data => {
        console.log("Response:", data);

        if (data.error) {
            document.getElementById("output").innerText = data.error;
            return;
        }

        document.getElementById("output").innerText =
            JSON.stringify(data.cards, null, 2);
    })
    .catch(err => {
        console.error("Fetch error:", err);
    });
}