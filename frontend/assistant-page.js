document.addEventListener("DOMContentLoaded", async () => {
    /* ===============================
       🔐 1. AUTH CHECK
    =============================== */
    const token = localStorage.getItem('billmateToken');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    const $ = id => document.getElementById(id);
    const BASE_URL = (typeof window.getBillmateApiBase === 'function')
        ? window.getBillmateApiBase()
        : (window.BILLMATE_API_BASE_URL || "https://billmate-backend.onrender.com");

    const messagesBox = $("chatPageMessages");
    const chatForm = $("chatPageForm");
    const chatInput = $("chatPageInput");

    const getAuthHeaders = () => (typeof window.getBillmateAuthHeaders === 'function')
        ? window.getBillmateAuthHeaders()
        : {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('billmateToken') || ''}`
        };

    // Personalize Greeting
    const userName = localStorage.getItem("billmateUser") || "there";
    if ($("aiGreetingMessage")) {
        $("aiGreetingMessage").textContent = `Hello ${userName}! 👋 How can I help you with your bills and finances today?`;
    }

    /* ===============================
       📥 2. FETCH CHAT HISTORY
    =============================== */
    async function loadChatHistory() {
        try {
            const res = await fetch(`${BASE_URL}/api/ai/chat/history`, { headers: getAuthHeaders() });
            if (res.ok) {
                const history = await res.json();
                if (Array.isArray(history) && history.length > 0) {
                    // Clear initial greeting if we have existing history
                    if (messagesBox) messagesBox.innerHTML = "";
                    history.forEach(msg => {
                        appendMessage(msg.content, msg.role === 'user' ? 'user' : 'ai');
                    });
                }
            }
        } catch (e) {
            console.warn("Could not load chat history:", e);
        }
    }

    /* ===============================
       💬 3. MESSAGE HELPERS
    =============================== */
    function appendMessage(text, role) {
        if (!messagesBox) return null;

        const row = document.createElement("div");
        row.className = `chat-msg-row ${role}`;

        const avatar = document.createElement("div");
        avatar.className = `chat-msg-avatar ${role}`;
        avatar.innerHTML = role === 'user' ? '<i data-lucide="user"></i>' : '<i data-lucide="bot"></i>';

        const bubble = document.createElement("div");
        bubble.className = `chat-bubble ${role}`;
        bubble.innerHTML = `<p style="white-space: pre-line; margin: 0;">${text}</p>`;

        row.appendChild(avatar);
        row.appendChild(bubble);
        messagesBox.appendChild(row);

        if (window.lucide) {
            lucide.createIcons();
        }

        messagesBox.scrollTop = messagesBox.scrollHeight;
        return bubble;
    }

    function showTypingIndicator() {
        if (!messagesBox) return null;

        const row = document.createElement("div");
        row.id = "typingIndicatorRow";
        row.className = "chat-msg-row ai";

        row.innerHTML = `
            <div class="chat-msg-avatar ai"><i data-lucide="bot"></i></div>
            <div class="chat-bubble ai" style="display: flex; gap: 4px; align-items: center; padding: 10px 14px;">
                <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style="width:6px; height:6px; background:#94a3b8; border-radius:50%; display:inline-block;"></span>
                <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style="width:6px; height:6px; background:#94a3b8; border-radius:50%; display:inline-block; animation-delay: 0.15s;"></span>
                <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style="width:6px; height:6px; background:#94a3b8; border-radius:50%; display:inline-block; animation-delay: 0.3s;"></span>
            </div>
        `;
        messagesBox.appendChild(row);
        messagesBox.scrollTop = messagesBox.scrollHeight;
        return row;
    }

    function removeTypingIndicator() {
        const indicator = $("typingIndicatorRow");
        if (indicator) indicator.remove();
    }

    /* ===============================
       🚀 4. SEND MESSAGE LOGIC
    =============================== */
    async function sendMessage(userText) {
        const msg = (userText || (chatInput ? chatInput.value : "")).trim();
        if (!msg) return;

        appendMessage(msg, 'user');
        if (chatInput) chatInput.value = "";

        showTypingIndicator();

        try {
            const res = await fetch(`${BASE_URL}/api/ai/chat`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ message: msg })
            });

            removeTypingIndicator();

            if (res.ok) {
                const data = await res.json();
                appendMessage(data.reply || "I'm here to help manage your bills.", 'ai');
            } else {
                appendMessage("I encountered an issue connecting to the financial assistant. Please ensure backend server is active.", 'ai');
            }
        } catch (err) {
            removeTypingIndicator();
            appendMessage("⚠️ Connection error. Please check your internet connection and try again.", 'ai');
        }
    }

    if (chatForm) {
        chatForm.onsubmit = (e) => {
            e.preventDefault();
            sendMessage();
        };
    }

    // Suggestion chips
    document.querySelectorAll(".suggestion-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const prompt = chip.getAttribute("data-prompt") || chip.textContent;
            sendMessage(prompt);
        });
    });

    // Initial load
    loadChatHistory();
});
