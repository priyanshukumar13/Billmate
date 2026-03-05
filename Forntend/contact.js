document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".contact-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("name")?.value.trim() || "";
    const email = document.getElementById("email")?.value.trim() || "";
    const message = document.getElementById("message")?.value.trim() || "";

    if (!message) {
      alert("Please enter a message before sending.");
      return;
    }

    try {
      const res = await fetch("https://billmate-backend.onrender.com/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.error || "Failed to send your message. Please try again.");
        return;
      }

      alert("Thanks! Your message has been sent.");
      form.reset();
    } catch (err) {
      console.error("Contact form error:", err);
      alert("Network error while sending message. Please check your backend.");
    }
  });
});

