import { deleteChat, getChat, getChatsByUser, saveChat } from "./indexeddb.js";

const body = document.body;
const dashboardType = body.dataset.dashboard || "student";
const sidebar = document.getElementById("sidebar");
const mobileMenuBtn = document.getElementById("mobile-menu-btn");
const mobileOverlay = document.getElementById("mobile-overlay");
const viewButtons = Array.from(document.querySelectorAll("[data-view-target]"));
const views = Array.from(document.querySelectorAll("[data-view]"));

const user = {
    id: body.dataset.userId,
    username: body.dataset.username,
    role: body.dataset.role,
};

function setSidebar(open) {
    body.classList.toggle("sidebar-open", open);
}

if (mobileMenuBtn && sidebar && mobileOverlay) {
    mobileMenuBtn.addEventListener("click", () => setSidebar(true));
    mobileOverlay.addEventListener("click", () => setSidebar(false));
}

function activateView(viewName) {
    views.forEach((view) => {
        view.classList.toggle("is-active", view.dataset.view === viewName);
    });

    viewButtons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.viewTarget === viewName);
    });

    if (window.matchMedia("(max-width: 960px)").matches) {
        setSidebar(false);
    }
}

viewButtons.forEach((button) => {
    button.addEventListener("click", () => activateView(button.dataset.viewTarget || "overview"));
});

activateView("overview");

if (dashboardType === "student") {
    initStudentDashboard();
}

function initStudentDashboard() {
    const fileInput = document.getElementById("file-input");
    const uploadButton = document.getElementById("upload-btn");
    const dropZone = document.getElementById("drop-zone");
    const uploadStatus = document.getElementById("upload-status");
    const progressFill = document.getElementById("upload-progress-fill");
    const chatWindow = document.getElementById("chat-window");
    const chatForm = document.getElementById("chat-form");
    const chatInput = document.getElementById("chat-input");
    const historyList = document.getElementById("history-list");
    const summaryCard = document.getElementById("summary-card");
    const summaryText = document.getElementById("summary-text");
    const explainSimpleBtn = document.getElementById("explain-simple");
    const notesBtn = document.getElementById("generate-notes");
    const composerTip = document.getElementById("composer-tip");
    const newChatBtn = document.getElementById("new-chat-btn");

    let currentChatId = crypto.randomUUID();
    let currentMessages = [];
    let pendingUploadFile = null;
    let typingFrameId = null;

    function formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    function setUploadStatus(message, isError = false) {
        if (!uploadStatus) {
            return;
        }

        uploadStatus.textContent = message;
        uploadStatus.style.color = isError ? "var(--red)" : "var(--text-muted)";
    }

    function scrollChatToBottom() {
        if (chatWindow) {
            chatWindow.scrollTop = chatWindow.scrollHeight;
        }
    }

    function ensureWelcomeState() {
        if (!chatWindow || currentMessages.length > 0 || chatWindow.querySelector(".message-row")) {
            return;
        }

        const existing = document.getElementById("welcome-screen");
        if (existing) {
            existing.classList.remove("hidden");
            return;
        }

        const welcome = document.createElement("div");
        welcome.id = "welcome-screen";
        welcome.className = "welcome-screen";
        welcome.innerHTML = `
            <h3>Welcome to BuddyAI</h3>
            <p>Use the split layout to keep your session history on the left and your active chat on the right.</p>
        `;
        chatWindow.appendChild(welcome);
    }

    function hideWelcomeState() {
        const welcome = document.getElementById("welcome-screen");
        if (welcome) {
            welcome.remove();
        }
    }

    function appendMessage(message) {
        if (!chatWindow) {
            return;
        }

        hideWelcomeState();

        const row = document.createElement("article");
        row.className = `message-row ${message.role}`;

        const bubble = document.createElement("div");
        bubble.className = "message-bubble";

        const text = document.createElement("div");
        text.className = "message-text";
        text.textContent = message.text;

        const meta = document.createElement("div");
        meta.className = "message-meta";

        const time = document.createElement("span");
        time.textContent = formatTime(message.timestamp || Date.now());
        meta.appendChild(time);

        if (message.role === "ai") {
            const copyBtn = document.createElement("button");
            copyBtn.className = "copy-btn";
            copyBtn.type = "button";
            copyBtn.textContent = "Copy";
            copyBtn.addEventListener("click", async () => {
                await navigator.clipboard.writeText(message.text);
                copyBtn.textContent = "Copied";
                window.setTimeout(() => {
                    copyBtn.textContent = "Copy";
                }, 900);
            });
            meta.appendChild(copyBtn);
        }

        bubble.appendChild(text);
        bubble.appendChild(meta);
        row.appendChild(bubble);
        chatWindow.appendChild(row);
        scrollChatToBottom();
    }

    function appendTypingMessage(text) {
        return new Promise((resolve) => {
            if (!chatWindow) {
                resolve();
                return;
            }

            hideWelcomeState();

            const row = document.createElement("article");
            row.className = "message-row ai";

            const bubble = document.createElement("div");
            bubble.className = "message-bubble";

            const textNode = document.createElement("div");
            textNode.className = "message-text";

            const meta = document.createElement("div");
            meta.className = "message-meta";

            const time = document.createElement("span");
            time.textContent = formatTime(Date.now());
            meta.appendChild(time);

            const copyBtn = document.createElement("button");
            copyBtn.className = "copy-btn";
            copyBtn.type = "button";
            copyBtn.textContent = "Copy";
            copyBtn.addEventListener("click", async () => {
                await navigator.clipboard.writeText(text);
                copyBtn.textContent = "Copied";
                window.setTimeout(() => {
                    copyBtn.textContent = "Copy";
                }, 900);
            });

            meta.appendChild(copyBtn);
            bubble.appendChild(textNode);
            bubble.appendChild(meta);
            row.appendChild(bubble);
            chatWindow.appendChild(row);

            let index = 0;
            const step = () => {
                textNode.textContent = text.slice(0, index);
                index += 1;
                scrollChatToBottom();

                if (index <= text.length) {
                    typingFrameId = window.requestAnimationFrame(step);
                    return;
                }

                resolve();
            };

            if (typingFrameId) {
                window.cancelAnimationFrame(typingFrameId);
            }

            typingFrameId = window.requestAnimationFrame(step);
        });
    }

    function renderSkeleton() {
        if (!chatWindow || document.getElementById("ai-skeleton")) {
            return;
        }

        const row = document.createElement("article");
        row.id = "ai-skeleton";
        row.className = "message-row ai";
        row.innerHTML = `
            <div class="message-bubble">
                <div class="message-text">BuddyAI is thinking...</div>
            </div>
        `;
        chatWindow.appendChild(row);
        scrollChatToBottom();
    }

    function removeSkeleton() {
        const skeleton = document.getElementById("ai-skeleton");
        if (skeleton) {
            skeleton.remove();
        }
    }

    async function persistCurrentChat() {
        await saveChat({
            chat_id: currentChatId,
            user_id: user.id,
            messages: currentMessages,
            timestamp: Date.now(),
        });
        await renderHistory();
    }

    async function renderHistory() {
        if (!historyList) {
            return;
        }

        const chats = await getChatsByUser(user.id);
        historyList.innerHTML = "";

        if (chats.length === 0) {
            historyList.innerHTML = '<div class="history-empty">No saved conversations yet.</div>';
            return;
        }

        chats.forEach((chat) => {
            const item = document.createElement("article");
            item.className = "history-item";
            if (chat.chat_id === currentChatId) {
                item.classList.add("active");
            }

            const firstUserMessage = (chat.messages || []).find((message) => message.role === "user")?.text || "Saved conversation";
            const title = firstUserMessage.length > 36 ? `${firstUserMessage.slice(0, 36)}...` : firstUserMessage;

            item.innerHTML = `
                <div class="history-title">${title}</div>
                <div class="history-time">${new Date(chat.timestamp).toLocaleString()}</div>
                <div class="history-actions">
                    <button class="history-btn resume-chat" data-chat-id="${chat.chat_id}" type="button">Open</button>
                    <button class="history-btn delete" data-chat-id="${chat.chat_id}" type="button">Delete</button>
                </div>
            `;

            historyList.appendChild(item);
        });
    }

    if (historyList) {
        historyList.addEventListener("click", async (event) => {
            const target = event.target;
            if (!(target instanceof HTMLButtonElement)) {
                return;
            }

            const chatId = target.dataset.chatId;
            if (!chatId) {
                return;
            }

            if (target.classList.contains("delete")) {
                await deleteChat(chatId);
                if (chatId === currentChatId) {
                    currentChatId = crypto.randomUUID();
                    currentMessages = [];
                    if (chatWindow) {
                        chatWindow.innerHTML = "";
                        ensureWelcomeState();
                    }
                }
                await renderHistory();
                return;
            }

            if (target.classList.contains("resume-chat")) {
                const chat = await getChat(chatId);
                if (!chat) {
                    return;
                }

                currentChatId = chat.chat_id;
                currentMessages = chat.messages || [];
                if (chatWindow) {
                    chatWindow.innerHTML = "";
                    currentMessages.forEach((message) => appendMessage(message));
                    ensureWelcomeState();
                }
                await renderHistory();
            }
        });
    }

    if (newChatBtn) {
        newChatBtn.addEventListener("click", async () => {
            currentChatId = crypto.randomUUID();
            currentMessages = [];

            if (chatWindow) {
                chatWindow.innerHTML = "";
                ensureWelcomeState();
            }

            if (summaryCard) {
                summaryCard.classList.add("hidden");
            }

            if (fileInput) {
                fileInput.value = "";
            }

            pendingUploadFile = null;
            setUploadStatus("Started a new chat.");
            await renderHistory();
        });
    }

    function uploadFileWithProgress(file) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append("file", file);

            const request = new XMLHttpRequest();
            request.open("POST", "/upload", true);

            request.upload.onprogress = (event) => {
                if (!event.lengthComputable || !progressFill) {
                    return;
                }

                const percent = Math.round((event.loaded / event.total) * 100);
                progressFill.style.width = `${percent}%`;
                setUploadStatus(`Uploading ${percent}%...`);
            };

            request.onload = () => {
                try {
                    const data = JSON.parse(request.responseText);
                    if (request.status < 200 || request.status >= 300) {
                        reject(new Error(data.error || "Upload failed."));
                        return;
                    }
                    resolve(data);
                } catch {
                    reject(new Error("Invalid server response."));
                }
            };

            request.onerror = () => reject(new Error("Network error during upload."));
            request.send(formData);
        });
    }

    function setPendingFile(file) {
        pendingUploadFile = file;
        if (file) {
            setUploadStatus(`Selected ${file.name}`);
        }
    }

    if (fileInput) {
        fileInput.addEventListener("change", () => {
            const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
            if (file) {
                setPendingFile(file);
            }
        });
    }

    if (dropZone) {
        dropZone.addEventListener("dragover", (event) => {
            event.preventDefault();
            dropZone.classList.add("dragging");
        });

        dropZone.addEventListener("dragleave", () => {
            dropZone.classList.remove("dragging");
        });

        dropZone.addEventListener("drop", (event) => {
            event.preventDefault();
            dropZone.classList.remove("dragging");

            const file = event.dataTransfer?.files?.[0];
            if (!file || !fileInput) {
                return;
            }

            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            setPendingFile(file);
        });
    }

    if (uploadButton) {
        uploadButton.addEventListener("click", async () => {
            const selectedFile = pendingUploadFile || fileInput?.files?.[0] || null;
            if (!selectedFile) {
                setUploadStatus("Choose a PDF or DOCX file first.", true);
                return;
            }

            if (progressFill) {
                progressFill.style.width = "0%";
            }

            setUploadStatus(`Preparing ${selectedFile.name}...`);

            try {
                const data = await uploadFileWithProgress(selectedFile);
                if (summaryCard) {
                    summaryCard.classList.remove("hidden");
                }
                if (summaryText) {
                    summaryText.textContent = data.summary;
                }

                setUploadStatus(`Uploaded ${data.filename}. ${data.char_count} characters extracted.`);
                const summaryMessage = { role: "ai", text: `Document summary:\n${data.summary}`, timestamp: Date.now() };
                currentMessages.push(summaryMessage);
                appendMessage(summaryMessage);
                await persistCurrentChat();
            } catch (error) {
                setUploadStatus(error.message || "Upload failed.", true);
            } finally {
                window.setTimeout(() => {
                    if (progressFill) {
                        progressFill.style.width = "0%";
                    }
                }, 900);
            }
        });
    }

    async function submitPrompt(prompt, mode = "default") {
        if (!prompt) {
            return;
        }

        const userMessage = { role: "user", text: prompt, timestamp: Date.now() };
        currentMessages.push(userMessage);
        appendMessage(userMessage);
        renderSkeleton();

        try {
            const response = await fetch("/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: prompt, mode }),
            });

            const data = await response.json();
            removeSkeleton();

            const replyText = response.ok ? data.reply : (data.error || "Failed to get AI response.");
            const aiMessage = { role: "ai", text: replyText, timestamp: Date.now() };
            currentMessages.push(aiMessage);
            await appendTypingMessage(replyText);
            await persistCurrentChat();
        } catch {
            removeSkeleton();
            const errorMessage = { role: "ai", text: "Network error while contacting BuddyAI.", timestamp: Date.now() };
            currentMessages.push(errorMessage);
            appendMessage(errorMessage);
            await persistCurrentChat();
        }
    }

    if (chatForm && chatInput) {
        chatForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const query = chatInput.value.trim();
            if (!query) {
                return;
            }

            chatInput.value = "";
            await submitPrompt(query, "default");
        });
    }

    if (notesBtn) {
        notesBtn.addEventListener("click", async () => {
            await submitPrompt("Generate smart study notes from this document.", "notes");
        });
    }

    if (explainSimpleBtn) {
        explainSimpleBtn.addEventListener("click", async () => {
            await submitPrompt("Explain the key concepts from this document in very simple language.", "eli5");
        });
    }

    if (composerTip) {
        composerTip.textContent = "Upload a file for context, or ask a general academic question right away.";
    }

    ensureWelcomeState();
    renderHistory();
}
