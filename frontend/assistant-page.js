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
    function appendMessage(text, role, pendingActions = []) {
        if (!messagesBox) return null;

        const row = document.createElement("div");
        row.className = `chat-msg-row ${role}`;

        const avatar = document.createElement("div");
        avatar.className = `chat-msg-avatar ${role}`;
        avatar.innerHTML = role === 'user' ? '<i data-lucide="user"></i>' : '<i data-lucide="bot"></i>';

        const bubble = document.createElement("div");
        bubble.className = `chat-bubble ${role}`;
        const paragraph = document.createElement("p");
        paragraph.style.whiteSpace = "pre-line";
        paragraph.style.margin = "0";
        paragraph.textContent = text;
        bubble.appendChild(paragraph);
        if (pendingActions.length) appendActionControls(bubble, pendingActions);

        row.appendChild(avatar);
        row.appendChild(bubble);
        messagesBox.appendChild(row);

        if (window.lucide) {
            lucide.createIcons();
        }

        messagesBox.scrollTop = messagesBox.scrollHeight;
        return bubble;
    }

    async function submitAction(token, operation) {
        const response = await fetch(`${BASE_URL}/api/ai/actions/${encodeURIComponent(token)}/${operation}`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || data.msg || 'Unable to update this action.');
        return data;
    }

    function appendActionControls(container, actions) {
        actions.forEach((action) => {
            const card = document.createElement("div");
            card.className = "chat-action-card";

            const preview = document.createElement("p");
            preview.className = "chat-action-preview";
            preview.textContent = action.preview || "Confirm this financial action.";
            card.appendChild(preview);

            const controls = document.createElement("div");
            controls.className = "chat-action-controls";
            const confirmButton = document.createElement("button");
            confirmButton.type = "button";
            confirmButton.className = "chat-action-confirm";
            confirmButton.textContent = "Confirm";
            const cancelButton = document.createElement("button");
            cancelButton.type = "button";
            cancelButton.className = "chat-action-cancel";
            cancelButton.textContent = "Cancel";
            const status = document.createElement("span");
            status.className = "chat-action-status";
            status.setAttribute("role", "status");

            async function run(operation) {
                confirmButton.disabled = true;
                cancelButton.disabled = true;
                status.textContent = operation === 'confirm' ? 'Processing…' : 'Cancelling…';
                try {
                    await submitAction(action.confirmationToken, operation);
                    status.textContent = operation === 'confirm' ? 'Action completed.' : 'Action cancelled.';
                    controls.remove();
                    await loadAutomations();
                } catch (error) {
                    status.textContent = error.message;
                    confirmButton.disabled = false;
                    cancelButton.disabled = false;
                }
            }

            confirmButton.addEventListener("click", () => run("confirm"));
            cancelButton.addEventListener("click", () => run("cancel"));
            controls.append(confirmButton, cancelButton);
            card.append(controls, status);
            container.appendChild(card);
        });
    }

    async function loadPendingActions() {
        try {
            const response = await fetch(`${BASE_URL}/api/ai/actions/pending`, { headers: getAuthHeaders() });
            if (!response.ok) return;
            const actions = await response.json();
            if (Array.isArray(actions) && actions.length) {
                appendMessage("These financial actions are waiting for your approval:", "ai", actions);
            }
        } catch (error) {
            console.warn("Could not load pending actions:", error);
        }
    }

    async function loadAutomations() {
        const automationList = $("automationList");
        const historyList = $("automationHistory");
        if (!automationList || !historyList) return;
        automationList.textContent = "Loading automations…";
        historyList.textContent = "Loading history…";

        try {
            const response = await fetch(`${BASE_URL}/api/ai/automations`, { headers: getAuthHeaders() });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || data.msg || "Could not load automations.");

            automationList.replaceChildren();
            if (!Array.isArray(data.automations) || data.automations.length === 0) {
                automationList.textContent = "No automations yet. Ask BillMate AI to create a budget alert, recurring reminder, or weekly report.";
            } else {
                data.automations.forEach((automation) => {
                    const item = document.createElement("div");
                    item.className = "automation-item";
                    const details = document.createElement("div");
                    const title = document.createElement("strong");
                    title.textContent = automation.name;
                    const info = document.createElement("p");
                    info.textContent = `${String(automation.type).replaceAll("_", " ")} · ${automation.enabled ? "Enabled" : "Paused"} · Next run: ${new Date(automation.nextRunAt).toLocaleString()}`;
                    details.append(title, info);
                    const toggle = document.createElement("button");
                    toggle.type = "button";
                    toggle.className = "chat-action-cancel";
                    toggle.textContent = automation.enabled ? "Pause" : "Enable";
                    toggle.addEventListener("click", async () => {
                        toggle.disabled = true;
                        try {
                            const update = await fetch(`${BASE_URL}/api/ai/automations/${encodeURIComponent(automation._id)}`, {
                                method: "PATCH",
                                headers: getAuthHeaders(),
                                body: JSON.stringify({ enabled: !automation.enabled })
                            });
                            const result = await update.json().catch(() => ({}));
                            if (!update.ok) throw new Error(result.error || result.msg || "Could not update automation.");
                            await loadAutomations();
                        } catch (error) {
                            toggle.disabled = false;
                            toggle.textContent = error.message;
                        }
                    });
                    item.append(details, toggle);
                    automationList.appendChild(item);
                });
            }

            historyList.replaceChildren();
            if (!Array.isArray(data.history) || data.history.length === 0) {
                historyList.textContent = "No automation runs yet.";
            } else {
                data.history.forEach((entry) => {
                    const item = document.createElement("p");
                    item.className = "automation-history-item";
                    item.textContent = `${String(entry.action).replaceAll("_", " ")} · ${entry.executionStatus} · ${new Date(entry.executedAt).toLocaleString()}`;
                    historyList.appendChild(item);
                });
            }
        } catch (error) {
            automationList.textContent = error.message;
            historyList.textContent = "Automation history is unavailable.";
        }
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
                appendMessage(data.reply || "I'm here to help manage your bills.", 'ai', data.pendingActions || []);
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
        if (chip.id === "refreshAutomations") return;
        chip.addEventListener("click", () => {
            const prompt = chip.getAttribute("data-prompt") || chip.textContent;
            sendMessage(prompt);
        });
    });
    $("refreshAutomations")?.addEventListener("click", loadAutomations);

    // Initial load
    loadChatHistory().then(loadPendingActions);
    loadAutomations();
});
