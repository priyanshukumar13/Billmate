// Shared chatbot / assistant logic for index + dashboard
(function () {
  /* ===========================
     BillMate AI Assistant
  =========================== */

  function getBaseUrl() {
    return (typeof window.getBillmateApiBase === 'function')
      ? window.getBillmateApiBase()
      : (window.BILLMATE_API_BASE_URL || "https://billmate-backend.onrender.com");
  }

  async function callAI(message) {
    try {
      const token = localStorage.getItem("billmateToken");

      if (!token) {
        console.warn(
          "No authentication token found. Please log in first."
        );
        return null;
      }

      const res = await fetch(
        `${getBaseUrl()}/api/ai/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            message: message
          })
        }
      );

      if (!res.ok) {
        const errorText = await res.text();

        console.error(
          "BillMate AI API error:",
          res.status,
          errorText
        );

        return null;
      }

      return await res.json();
    } catch (error) {
      console.error("Assistant error:", error);
      return null;
    }
  }

  /* ===========================
     Dashboard Smart Assistant
  =========================== */

  function initDashboardAssistant() {
    const messagesBox = document.getElementById(
      "assistant-messages"
    );

    const suggestBtn = document.getElementById(
      "assistant-suggest"
    );

    const laterBtn = document.getElementById(
      "assistant-later"
    );

    if (!messagesBox || !suggestBtn || !laterBtn) return;

    function addMessage(text, who = "bot") {
      const div = document.createElement("div");

      div.className =
        `assistant-message assistant-${who}`;

      div.textContent = text;

      messagesBox.appendChild(div);

      messagesBox.scrollTop =
        messagesBox.scrollHeight;
    }

    async function fetchBills() {
      try {
        const token =
          localStorage.getItem("billmateToken");

        if (!token) return [];

        const res = await fetch(
          `${getBaseUrl()}/api/bills`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            }
          }
        );

        if (!res.ok) return [];

        const data = await res.json();

        return Array.isArray(data)
          ? data
          : [];
      } catch (error) {
        console.error(
          "Error fetching bills:",
          error
        );

        return [];
      }
    }

    async function computeAdvice(mode) {
      const billsRaw = await fetchBills();

      const unpaid = billsRaw.filter(
        (b) =>
          String(b.status || "Unpaid") ===
          "Unpaid"
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

          b._dueDateObj = isNaN(d.getTime())
            ? null
            : d;
        } else {
          b._dueDateObj = null;
        }
      });

      unpaid.sort((a, b) => {
        if (
          a._dueDateObj &&
          b._dueDateObj
        ) {
          return (
            a._dueDateObj -
            b._dueDateObj
          );
        }

        if (a._dueDateObj) return -1;

        if (b._dueDateObj) return 1;

        return (
          (Number(b.amount) || 0) -
          (Number(a.amount) || 0)
        );
      });

      const userBudget =
        Number(
          localStorage.getItem("userBudget")
        ) || 20000;

      const toPayNow = [];
      const toPayLater = [];

      let running = 0;

      unpaid.forEach((b) => {
        const amt =
          Number(b.amount) || 0;

        const dd = b._dueDateObj
          ? new Date(
            b._dueDateObj.getTime()
          )
          : null;

        let days = null;

        if (dd) {
          dd.setHours(
            0,
            0,
            0,
            0
          );

          const t = new Date(
            today.getTime()
          );

          t.setHours(
            0,
            0,
            0,
            0
          );

          days = Math.ceil(
            (dd - t) / 86400000
          );
        }

        const item = {
          name: b.name,
          amount: amt,
          days: days
        };

        if (mode === "now") {
          if (
            days !== null &&
            days <= 3
          ) {
            running += amt;

            if (
              running <=
              userBudget * 0.6
            ) {
              toPayNow.push(item);
            } else {
              toPayLater.push(item);
            }
          } else {
            toPayLater.push(item);
          }
        } else {
          if (
            days !== null &&
            days <= 7
          ) {
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
                    ? ` (overdue by ${Math.abs(
                      i.days
                    )} days)`
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
          `You can plan these for a bit later:\n${formatList(
            toPayLater
          )}`,
          "bot"
        );
      }
    }

    suggestBtn.onclick = () =>
      computeAdvice("now");

    laterBtn.onclick = () =>
      computeAdvice("later");
  }

  /* ===========================
     Landing Page AI Chatbot
  =========================== */

  function initLandingChat() {
    const container =
      document.querySelector("body");

    if (!container) return;

    // Floating button
    const trigger =
      document.createElement("button");

    trigger.className =
      "bm-chat-trigger";

    trigger.textContent =
      "Need help?";

    // Chat panel
    const panel =
      document.createElement("div");

    panel.className =
      "bm-chat-panel";

    panel.innerHTML = `
      <div class="bm-chat-header">
        <strong>BillMate Assistant</strong>
        <span>
          Ask me anything about your bills,
          spending, budget, or reminders.
        </span>
      </div>

      <div
        class="bm-chat-messages"
        id="bm-chat-messages"
      ></div>

      <div class="bm-chat-input-row">
        <input
          id="bm-chat-input"
          type="text"
          placeholder="Ask me anything about BillMate..."
        />

        <button id="bm-chat-send">
          Send
        </button>
      </div>
    `;

    container.appendChild(trigger);
    container.appendChild(panel);

    const messages =
      panel.querySelector(
        "#bm-chat-messages"
      );

    const input =
      panel.querySelector(
        "#bm-chat-input"
      );

    const sendBtn =
      panel.querySelector(
        "#bm-chat-send"
      );

    function addMsg(
      text,
      who = "bot"
    ) {
      const div =
        document.createElement("div");

      div.className =
        `bm-msg bm-${who}`;

      div.textContent = text;

      messages.appendChild(div);

      messages.scrollTop =
        messages.scrollHeight;
      return div;
    }

    function renderPendingActions(actions) {
      if (!Array.isArray(actions) || actions.length === 0) return;
      const container = document.createElement("div");
      container.className = "bm-msg bm-bot";

      actions.forEach((action) => {
        const card = document.createElement("div");
        card.style.cssText = "border:1px solid #64748b;border-radius:10px;padding:10px;margin-top:8px;";
        const preview = document.createElement("p");
        preview.textContent = action.preview || "Confirm this financial action.";
        const controls = document.createElement("div");
        controls.style.cssText = "display:flex;gap:8px;";
        const status = document.createElement("p");
        status.setAttribute("role", "status");
        const confirm = document.createElement("button");
        confirm.type = "button";
        confirm.textContent = "Confirm";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Cancel";

        async function submit(operation) {
          confirm.disabled = true;
          cancel.disabled = true;
          status.textContent = operation === "confirm" ? "Processing…" : "Cancelling…";
          try {
            const response = await fetch(
              `${getBaseUrl()}/api/ai/actions/${encodeURIComponent(action.confirmationToken)}/${operation}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${localStorage.getItem("billmateToken") || ""}`
                }
              }
            );
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || data.msg || "Unable to update this action.");
            status.textContent = operation === "confirm" ? "Action completed." : "Action cancelled.";
            controls.remove();
          } catch (error) {
            status.textContent = error.message;
            confirm.disabled = false;
            cancel.disabled = false;
          }
        }

        confirm.addEventListener("click", () => submit("confirm"));
        cancel.addEventListener("click", () => submit("cancel"));
        controls.append(confirm, cancel);
        card.append(preview, controls, status);
        container.appendChild(card);
      });

      messages.appendChild(container);
      messages.scrollTop = messages.scrollHeight;
    }

    // Initial message
    addMsg(
      "Hi! 👋 I’m BillMate AI Assistant. Ask me anything about managing your bills, spending, budget, payments, or reminders.",
      "bot"
    );

    // Open / close chat
    trigger.onclick = () => {
      panel.classList.toggle("open");
    };

    async function handleQuestion() {
      const q =
        (input.value || "").trim();

      if (!q) return;

      // Show user message
      addMsg(q, "user");

      input.value = "";

      // Loading message
      const loadingDiv =
        document.createElement("div");

      loadingDiv.className =
        "bm-msg bm-bot";

      loadingDiv.textContent =
        "Thinking...";

      messages.appendChild(
        loadingDiv
      );

      messages.scrollTop =
        messages.scrollHeight;

      // Call BillMate backend
      const aiResult =
        await callAI(q);

      // Remove loading message
      loadingDiv.remove();

      // AI successfully responded
      if (aiResult?.reply) {
        addMsg(
          aiResult.reply,
          "bot"
        );
        renderPendingActions(aiResult.pendingActions);

        return;
      }

      // Local fallback answers
      const lower =
        q.toLowerCase();

      if (
        lower.includes("hello") ||
        lower.includes("hi") ||
        lower === "hlo" ||
        lower === "hii"
      ) {
        addMsg(
          "Hello! 👋 How can I help you with BillMate today? You can ask me about your bills, spending, budget, due dates, or reminders.",
          "bot"
        );
      } else if (
        lower.includes("add") &&
        lower.includes("bill")
      ) {
        addMsg(
          "Here’s how to add a bill:\n\n1) Go to the Dashboard.\n2) Find “Add New Bill”.\n3) Enter the bill name.\n4) Enter the amount.\n5) Select the due date.\n6) Choose a category.\n7) Click “Add Bill”.",
          "bot"
        );
      } else if (
        lower.includes("budget")
      ) {
        addMsg(
          "You can set your monthly budget from the dashboard. BillMate can then help you understand your spending and remaining budget.",
          "bot"
        );
      } else if (
        lower.includes("login") ||
        lower.includes("account")
      ) {
        addMsg(
          "If you're new, sign up from the home page. After signup or login, you can manage your bills from your dashboard.",
          "bot"
        );
      } else if (
        lower.includes("reminder") ||
        lower.includes("notification")
      ) {
        addMsg(
          "BillMate helps you track upcoming due dates and reminders so you can avoid missing payments.",
          "bot"
        );
      } else {
        addMsg(
          "I'm having trouble connecting to BillMate AI right now. Please make sure you are logged in and try again.",
          "bot"
        );
      }
    }

    // Send button
    sendBtn.onclick =
      handleQuestion;

    // Enter key
    input.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Enter") {
          handleQuestion();
        }
      }
    );
  }

  /* ===========================
     Chat Styles
  =========================== */

  function initStyles() {
    if (
      document.getElementById(
        "bm-chat-styles"
      )
    ) {
      return;
    }

    const style =
      document.createElement("style");

    style.id =
      "bm-chat-styles";

    style.textContent = `

      .bm-chat-trigger {
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 999;

        background: linear-gradient(
          135deg,
          #4f46e5,
          #6366f1
        );

        color: #fff;
        border: none;
        border-radius: 999px;

        padding: 10px 18px;

        font-size: 0.9rem;
        font-weight: 500;

        box-shadow:
          0 12px 30px
          rgba(79, 70, 229, 0.4);

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

        border:
          1px solid
          rgba(148, 163, 184, 0.5);

        box-shadow:
          0 22px 60px
          rgba(15, 23, 42, 0.9);

        display: none;
        flex-direction: column;

        overflow: hidden;

        z-index: 998;
      }

      body.theme-light
      .bm-chat-panel {
        background: #ffffff;
        color: #111827;
      }

      .bm-chat-panel.open {
        display: flex;
      }

      .bm-chat-header {
        padding: 10px 14px;

        border-bottom:
          1px solid
          rgba(15, 23, 42, 0.7);

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

        background:
          rgba(15, 23, 42, 0.9);
      }

      body.theme-light
      .bm-chat-messages {
        background: #f9fafb;
      }

      .bm-msg {
        padding: 8px 10px;

        border-radius: 10px;

        font-size: 0.85rem;

        margin-bottom: 6px;

        max-width: 90%;

        white-space: pre-wrap;
        word-wrap: break-word;
      }

      .bm-bot {
        background:
          rgba(31, 41, 55, 0.9);
      }

      .bm-user {
        background: #4f46e5;

        color: #e5e7eb;

        margin-left: auto;
      }

      body.theme-light
      .bm-bot {
        background: #e5e7eb;
      }

      .bm-chat-input-row {
        display: flex;

        padding: 8px;

        gap: 6px;

        border-top:
          1px solid
          rgba(15, 23, 42, 0.7);

        background:
          rgba(15, 23, 42, 0.98);
      }

      body.theme-light
      .bm-chat-input-row {
        background: #f3f4f6;
      }

      #bm-chat-input {
        flex: 1;

        border-radius: 999px;

        border:
          1px solid
          rgba(148, 163, 184, 0.7);

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

  /* ===========================
     Initialize Assistant
  =========================== */

  function initializeAssistant() {
    initStyles();

    // Dashboard assistant
    if (
      window.location.pathname.endsWith(
        "dashboard.html"
      )
    ) {
      initDashboardAssistant();
    }

    // Landing page chatbot
    if (
      window.location.pathname.endsWith(
        "index.html"
      ) ||
      window.location.pathname === "/"
    ) {
      initLandingChat();
    }
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initializeAssistant
    );
  } else {
    initializeAssistant();
  }

})();