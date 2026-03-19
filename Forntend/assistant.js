// Shared chatbot / assistant logic for index + dashboard
(function () {
  const GEMINI_ENDPOINT =
    "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent";

  function getGeminiKey() {
    // User can define this in a separate, git-ignored file:
    // window.BILLMATE_GEMINI_API_KEY = "your-key";
    return window.BILLMATE_GEMINI_API_KEY || null;
  }

  async function callGemini(prompt) {
    const apiKey = getGeminiKey();
    if (!apiKey) return null; // Fallback to rule-based assistant

    try {
      const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text:
                    "You are BillMate's in-app assistant. " +
                    "Explain things in very short, step-by-step answers. " +
                    "Focus on: how to add bills, understand budget, and avoid late fees. " +
                    "User question: " +
                    prompt,
                },
              ],
            },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n");
      return text || null;
    } catch (e) {
      console.error("Gemini error:", e);
      return null;
    }
  }

  /* ===========================
     Dashboard Smart Assistant
  =========================== */

  function initDashboardAssistant() {
    const messagesBox = document.getElementById("assistant-messages");
    const suggestBtn = document.getElementById("assistant-suggest");
    const laterBtn = document.getElementById("assistant-later");
    if (!messagesBox || !suggestBtn || !laterBtn) return;

    function addMessage(text, who = "bot") {
      const div = document.createElement("div");
      div.className = `assistant-message assistant-${who}`;
      div.textContent = text;
      messagesBox.appendChild(div);
      messagesBox.scrollTop = messagesBox.scrollHeight;
    }

    async function fetchBills() {
      try {
        const token = localStorage.getItem("billmateToken");
        if (!token) return [];

        const res = await fetch("https://billmate-backend.onrender.com/api/bills", {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    }

    async function computeAdvice(mode) {
      const billsRaw = await fetchBills();
      const unpaid = billsRaw.filter(
        (b) => String(b.status || "Unpaid") === "Unpaid"
      );

      if (unpaid.length === 0) {
        addMessage(
          "Nice! You have no unpaid bills right now. You’re fully up to date.",
          "bot"
        );
        return;
      }

      const today = new Date();
      unpaid.forEach((b) => {
        if (b.date) {
          const d = new Date(b.date);
          b._dueDateObj = isNaN(d.getTime()) ? null : d;
        } else {
          b._dueDateObj = null;
        }
      });

      unpaid.sort((a, b) => {
        if (a._dueDateObj && b._dueDateObj) return a._dueDateObj - b._dueDateObj;
        if (a._dueDateObj) return -1;
        if (b._dueDateObj) return 1;
        return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      });

      const userBudget = Number(localStorage.getItem("userBudget")) || 20000;
      const toPayNow = [];
      const toPayLater = [];
      let running = 0;

      unpaid.forEach((b) => {
        const amt = Number(b.amount) || 0;
        const dd = b._dueDateObj
          ? new Date(b._dueDateObj.getTime())
          : null;
        let days = null;
        if (dd) {
          dd.setHours(0, 0, 0, 0);
          const t = new Date(today.getTime());
          t.setHours(0, 0, 0, 0);
          days = Math.ceil((dd - t) / 86400000);
        }

        const item = { name: b.name, amount: amt, days };

        if (mode === "now") {
          if (days !== null && days <= 3) {
            running += amt;
            if (running <= userBudget * 0.6) {
              toPayNow.push(item);
            } else {
              toPayLater.push(item);
            }
          } else {
            toPayLater.push(item);
          }
        } else {
          if (days !== null && days <= 7) {
            toPayNow.push(item);
          } else {
            toPayLater.push(item);
          }
        }
      });

      const formatList = (list) =>
        list
          .map((i) => {
            const when =
              i.days === null
                ? ""
                : i.days === 0
                ? " (due today)"
                : i.days < 0
                ? ` (overdue by ${Math.abs(i.days)} days)`
                : ` (due in ${i.days} days)`;
            return `• ${i.name} – ₹${i.amount}${when}`;
          })
          .join("\n");

      if (toPayNow.length) {
        addMessage(
          `Based on your current budget (about ₹${userBudget}) and due dates, I recommend paying these first:\n${formatList(
            toPayNow
          )}`,
          "bot"
        );
      } else {
        addMessage(
          "All your upcoming bills look comfortable against your current budget.",
          "bot"
        );
      }

      if (toPayLater.length) {
        addMessage(
          `You can plan these for a bit later:\n${formatList(toPayLater)}`,
          "bot"
        );
      }
    }

    suggestBtn.onclick = () => computeAdvice("now");
    laterBtn.onclick = () => computeAdvice("later");
  }

  /* ===========================
     Landing page mini chatbot
  =========================== */

  function initLandingChat() {
    const container = document.querySelector("body");
    if (!container) return;

    // Floating button
    const trigger = document.createElement("button");
    trigger.className = "bm-chat-trigger";
    trigger.textContent = "Need help?";

    const panel = document.createElement("div");
    panel.className = "bm-chat-panel";
    panel.innerHTML = `
      <div class="bm-chat-header">
        <strong>BillMate Assistant</strong>
        <span>Ask how to start, add bills, or manage budget.</span>
      </div>
      <div class="bm-chat-messages" id="bm-chat-messages"></div>
      <div class="bm-chat-input-row">
        <input id="bm-chat-input" type="text" placeholder="Ask me anything about BillMate..." />
        <button id="bm-chat-send">Send</button>
      </div>
    `;

    container.appendChild(trigger);
    container.appendChild(panel);

    const messages = panel.querySelector("#bm-chat-messages");
    const input = panel.querySelector("#bm-chat-input");
    const sendBtn = panel.querySelector("#bm-chat-send");

    function addMsg(text, who = "bot") {
      const div = document.createElement("div");
      div.className = `bm-msg bm-${who}`;
      div.textContent = text;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    addMsg(
      "Hi! I’m here to help you get started. Try asking: “How do I add my first bill?”",
      "bot"
    );

    trigger.onclick = () => {
      panel.classList.toggle("open");
    };

    async function handleQuestion() {
      const q = (input.value || "").trim();
      if (!q) return;
      addMsg(q, "user");
      input.value = "";

      // Try Gemini first
      const aiAnswer = await callGemini(q);
      if (aiAnswer) {
        addMsg(aiAnswer, "bot");
        return;
      }

      // Simple local fallback answers
      const lower = q.toLowerCase();
      if (lower.includes("add") && lower.includes("bill")) {
        addMsg(
          "Here’s how to add a bill step by step:\n\n1) Go to the Dashboard (top left menu).\n2) Find the card titled “Add New Bill”.\n3) In “Bill Name”, type what the bill is for (e.g. Electricity, Rent).\n4) In “Amount”, enter the bill amount (only numbers).\n5) Click the date field and pick the bill’s due date.\n6) Choose a category (Rent, Food, Bills, Other).\n7) Click the blue “Add Bill” button.\n\nAfter that the bill appears in Recent Transactions, affects your totals at the top, and also shows on the calendar page.",
          "bot"
        );
      } else if (lower.includes("budget")) {
        addMsg(
          "Use “Set Monthly Budget” on the dashboard to choose your limit. I’ll compare all Paid bills against it and show how much you’ve used and what’s remaining.",
          "bot"
        );
      } else if (lower.includes("login") || lower.includes("account")) {
        addMsg(
          "First, sign up from the home page if you’re new. After signup or login, you’ll be taken to the dashboard where all features unlock.",
          "bot"
        );
      } else {
        addMsg(
          "I didn’t fully understand that, but you can ask me about: adding bills, setting a budget, or how reminders and email alerts work.",
          "bot"
        );
      }
    }

    sendBtn.onclick = handleQuestion;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleQuestion();
    });
  }

  function initStyles() {
    if (document.getElementById("bm-chat-styles")) return;
    const style = document.createElement("style");
    style.id = "bm-chat-styles";
    style.textContent = `
      .bm-chat-trigger {
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 999;
        background: linear-gradient(135deg, #4f46e5, #6366f1);
        color: #fff;
        border: none;
        border-radius: 999px;
        padding: 10px 18px;
        font-size: 0.9rem;
        font-weight: 500;
        box-shadow: 0 12px 30px rgba(79, 70, 229, 0.4);
        cursor: pointer;
      }
      .bm-chat-panel {
        position: fixed;
        right: 24px;
        bottom: 80px;
        width: 320px;
        max-height: 420px;
        background: #020617;
        color: #e5e7eb;
        border-radius: 16px;
        border: 1px solid rgba(148,163,184,0.5);
        box-shadow: 0 22px 60px rgba(15,23,42,0.9);
        display: none;
        flex-direction: column;
        overflow: hidden;
        z-index: 998;
      }
      body.theme-light .bm-chat-panel {
        background: #ffffff;
        color: #111827;
      }
      .bm-chat-panel.open { display: flex; }
      .bm-chat-header {
        padding: 10px 14px;
        border-bottom: 1px solid rgba(15,23,42,0.7);
        font-size: 0.85rem;
      }
      .bm-chat-header span {
        display: block;
        margin-top: 2px;
        color: #9ca3af;
      }
      .bm-chat-messages {
        flex: 1;
        padding: 10px 12px;
        overflow-y: auto;
        background: rgba(15,23,42,0.9);
      }
      body.theme-light .bm-chat-messages {
        background: #f9fafb;
      }
      .bm-msg {
        padding: 8px 10px;
        border-radius: 10px;
        font-size: 0.85rem;
        margin-bottom: 6px;
        max-width: 90%;
      }
      .bm-bot {
        background: rgba(31,41,55,0.9);
      }
      .bm-user {
        background: #4f46e5;
        color: #e5e7eb;
        margin-left: auto;
      }
      body.theme-light .bm-bot {
        background: #e5e7eb;
      }
      .bm-chat-input-row {
        display: flex;
        padding: 8px;
        gap: 6px;
        border-top: 1px solid rgba(15,23,42,0.7);
        background: rgba(15,23,42,0.98);
      }
      body.theme-light .bm-chat-input-row {
        background: #f3f4f6;
      }
      #bm-chat-input {
        flex: 1;
        border-radius: 999px;
        border: 1px solid rgba(148,163,184,0.7);
        padding: 6px 10px;
        font-size: 0.85rem;
        outline: none;
        background: transparent;
        color: inherit;
      }
      #bm-chat-send {
        border-radius: 999px;
        border: none;
        padding: 6px 12px;
        font-size: 0.8rem;
        background: #4f46e5;
        color: #e5e7eb;
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initStyles();
      if (window.location.pathname.endsWith("dashboard.html")) {
        initDashboardAssistant();
      }
      if (window.location.pathname.endsWith("index.html") || window.location.pathname === "/" ) {
        initLandingChat();
      }
    });
  } else {
    initStyles();
    if (window.location.pathname.endsWith("dashboard.html")) {
      initDashboardAssistant();
    }
    if (window.location.pathname.endsWith("index.html") || window.location.pathname === "/") {
      initLandingChat();
    }
  }
})();

