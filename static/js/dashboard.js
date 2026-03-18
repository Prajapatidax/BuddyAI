import { deleteChat, getChat, getChatsByUser, saveChat } from "./indexeddb.js";

const user = {
    id: document.body.dataset.userId,
    username: document.body.dataset.username,
};

const fileInput = document.getElementById("file-input");
const uploadButton = document.getElementById("upload-btn");
const dropZone = document.getElementById("drop-zone");
const uploadStatus = document.getElementById("upload-status");
const progressTrack = document.getElementById("upload-progress-track");
const progressFill = document.getElementById("upload-progress-fill");

const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const composerTip = document.getElementById("composer-tip");
const historyList = document.getElementById("history-list");
const activeDoc = document.getElementById("active-doc");
const summaryCard = document.getElementById("summary-card");
const summaryText = document.getElementById("summary-text");

const mobileMenuBtn = document.getElementById("mobile-menu-btn");
const mobileOverlay = document.getElementById("mobile-overlay");

const explainSimpleBtn = document.getElementById("explain-simple");
const notesBtn = document.getElementById("generate-notes");

let currentChatId = crypto.randomUUID();
let currentMessages = [];
let hasUploadedDocument = false;

function setUploadStatus(text, isError = false) {
    uploadStatus.textContent = text;
    uploadStatus.style.color = isError ? "#b42318" : "inherit";
}

function setChatAvailability(enabled) {
    hasUploadedDocument = enabled;
    chatInput.disabled = !enabled;
    sendBtn.disabled = !enabled;

    if (enabled) {
        composerTip.textContent = "Tip: Ask for summary, key points, examples, and exam-ready notes.";
    } else {
        composerTip.textContent = "Upload a file to start. Tip: Ask for summary, definitions, and key points.";
    }
}

function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function scrollToBottom() {
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function showEmptyState() {
    if (currentMessages.length > 0) {
        return;
    }
    chatWindow.innerHTML = `
        <div class="empty-state" id="empty-state">
            <h3>Upload a file to start</h3>
            <p>BuddyAI will analyze your document and answer context-aware academic questions.</p>
        </div>
    `;
}

function clearEmptyState() {
    const state = document.getElementById("empty-state");
    if (state) {
        state.remove();
    }
}

function appendMessageBubble(message) {
    const { role, text } = message;
    const timestamp = message.timestamp || Date.now();

    const row = document.createElement("article");
    row.className = `message-row ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    const content = document.createElement("div");
    content.className = "message-text";
    content.textContent = text;

    const meta = document.createElement("div");
    meta.className = "message-meta";

    const time = document.createElement("span");
    time.textContent = formatTime(timestamp);
    meta.appendChild(time);

    if (role === "ai") {
        const copyBtn = document.createElement("button");
        copyBtn.className = "copy-btn";
        copyBtn.type = "button";
        copyBtn.textContent = "Copy";
        copyBtn.addEventListener("click", async () => {
            await navigator.clipboard.writeText(text);
            copyBtn.textContent = "Copied";
            setTimeout(() => {
                copyBtn.textContent = "Copy";
            }, 900);
        });
        meta.appendChild(copyBtn);
    }

    bubble.appendChild(content);
    bubble.appendChild(meta);
    row.appendChild(bubble);
    chatWindow.appendChild(row);
    scrollToBottom();
}

function appendTypingMessage(role, text, timestamp = Date.now()) {
    return new Promise((resolve) => {
        clearEmptyState();
        const row = document.createElement("article");
        row.className = `message-row ${role}`;

        const bubble = document.createElement("div");
        bubble.className = "message-bubble";

        const content = document.createElement("div");
        content.className = "message-text";

        const meta = document.createElement("div");
        meta.className = "message-meta";

        const time = document.createElement("span");
        time.textContent = formatTime(timestamp);
        meta.appendChild(time);

        const copyBtn = document.createElement("button");
        copyBtn.className = "copy-btn";
        copyBtn.type = "button";
        copyBtn.textContent = "Copy";
        copyBtn.addEventListener("click", async () => {
            await navigator.clipboard.writeText(text);
            copyBtn.textContent = "Copied";
            setTimeout(() => {
                copyBtn.textContent = "Copy";
            }, 900);
        });

        meta.appendChild(copyBtn);
        bubble.appendChild(content);
        bubble.appendChild(meta);
        row.appendChild(bubble);
        chatWindow.appendChild(row);

        let idx = 0;
        const speed = 10;
        const timer = setInterval(() => {
            content.textContent = text.slice(0, idx);
            idx += 1;
            scrollToBottom();

            if (idx > text.length) {
                clearInterval(timer);
                resolve();
            }
        }, speed);
    });
}

function renderSkeleton() {
    const row = document.createElement("div");
    row.className = "message-row ai";
    row.id = "ai-skeleton";
    row.innerHTML = `
        <div class="skeleton">
            <div class="skeleton-line" style="width: 100%;"></div>
            <div class="skeleton-line" style="width: 92%;"></div>
            <div class="skeleton-line" style="width: 85%;"></div>
        </div>
    `;
    chatWindow.appendChild(row);
    scrollToBottom();
}

function removeSkeleton() {
    const skeleton = document.getElementById("ai-skeleton");
    if (skeleton) {
        skeleton.remove();
    }
}

async function persistCurrentChat() {
    const payload = {
        chat_id: currentChatId,
        user_id: user.id,
        messages: currentMessages,
        timestamp: Date.now(),
    };
    await saveChat(payload);
    await renderHistory();
}

async function renderHistory() {
    const chats = await getChatsByUser(user.id);
    historyList.innerHTML = "";

    if (chats.length === 0) {
        historyList.innerHTML = '<div class="history-empty">No previous chats yet.</div>';
        return;
    }

    chats.forEach((chat) => {
        const item = document.createElement("div");
        item.className = "history-item";
        if (chat.chat_id === currentChatId) {
            item.classList.add("active");
        }

        const firstUserMessage = (chat.messages || []).find((m) => m.role === "user")?.text || "Saved conversation";
        const title = firstUserMessage.length > 36 ? `${firstUserMessage.slice(0, 36)}...` : firstUserMessage;
        const date = new Date(chat.timestamp).toLocaleString();

        item.innerHTML = `
            <div class="history-title">${title}</div>
            <div class="history-time">${date}</div>
            <div class="history-actions">
                <button class="history-btn resume-chat" data-id="${chat.chat_id}">Open</button>
                <button class="history-btn delete" data-id="${chat.chat_id}">Delete</button>
            </div>
        `;
        historyList.appendChild(item);
    });
}

historyList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
        return;
    }

    const chatId = target.dataset.id;
    if (!chatId) {
        return;
    }

    if (target.classList.contains("delete")) {
        await deleteChat(chatId);
        if (chatId === currentChatId) {
            currentChatId = crypto.randomUUID();
            currentMessages = [];
            chatWindow.innerHTML = "";
            showEmptyState();
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
        chatWindow.innerHTML = "";
        currentMessages.forEach((message) => appendMessageBubble(message));
        showEmptyState();
        await renderHistory();
    }
});

function uploadFileWithProgress(file) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append("file", file);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/upload", true);

        xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) {
                return;
            }
            const percent = Math.round((event.loaded / event.total) * 100);
            progressFill.style.width = `${percent}%`;
            setUploadStatus(`Uploading... ${percent}%`);
        };

        xhr.onload = () => {
            try {
                const data = JSON.parse(xhr.responseText);
                if (xhr.status < 200 || xhr.status >= 300) {
                    reject(new Error(data.error || "Upload failed."));
                    return;
                }
                resolve(data);
            } catch {
                reject(new Error("Invalid server response."));
            }
        };

        xhr.onerror = () => reject(new Error("Network error during upload."));
        xhr.send(formData);
    });
}

uploadButton.addEventListener("click", async () => {
    if (!fileInput.files.length) {
        setUploadStatus("Please select a file first.", true);
        return;
    }

    const selectedFile = fileInput.files[0];
    progressTrack.classList.remove("hidden");
    progressFill.style.width = "0%";

    setUploadStatus(`Preparing ${selectedFile.name} ...`);

    try {
        const data = await uploadFileWithProgress(selectedFile);

        activeDoc.textContent = `Active file: ${data.filename}`;
        setUploadStatus(`Uploaded successfully. ${data.char_count} chars extracted.`);
        setChatAvailability(true);

        summaryCard.classList.remove("hidden");
        summaryText.textContent = data.summary;

        const summaryText = `Auto Summary:\n${data.summary}`;
        currentMessages.push({ role: "ai", text: summaryText, timestamp: Date.now() });
        clearEmptyState();
        await appendTypingMessage("ai", summaryText, Date.now());
        await persistCurrentChat();
    } catch (error) {
        setUploadStatus(error.message || "Upload failed due to network/server issue.", true);
    } finally {
        setTimeout(() => {
            progressFill.style.width = "0%";
        }, 900);
    }
});

async function submitPrompt(prompt, mode = "default") {
    if (!hasUploadedDocument) {
        return;
    }

    clearEmptyState();
    const stampedUserMessage = { role: "user", text: prompt, timestamp: Date.now() };
    currentMessages.push(stampedUserMessage);
    appendMessageBubble(stampedUserMessage);

    renderSkeleton();

    try {
        const response = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: prompt, mode }),
        });

        const data = await response.json();
        removeSkeleton();

        if (!response.ok) {
            const msg = data.error || "Failed to get AI response.";
            const aiMessage = { role: "ai", text: msg, timestamp: Date.now() };
            currentMessages.push(aiMessage);
            appendMessageBubble(aiMessage);
            await persistCurrentChat();
            return;
        }

        const aiMessage = { role: "ai", text: data.reply, timestamp: Date.now() };
        currentMessages.push(aiMessage);
        await appendTypingMessage("ai", data.reply, aiMessage.timestamp);
        await persistCurrentChat();
    } catch {
        removeSkeleton();
        const errorText = "Network error while contacting BuddyAI.";
        const aiMessage = { role: "ai", text: errorText, timestamp: Date.now() };
        currentMessages.push(aiMessage);
        appendMessageBubble(aiMessage);
        await persistCurrentChat();
    }
}

chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = chatInput.value.trim();
    if (!query || !hasUploadedDocument) {
        return;
    }

    chatInput.value = "";
    await submitPrompt(query, "default");
});

notesBtn.addEventListener("click", async () => {
    await submitPrompt("Generate smart study notes from this document.", "notes");
});

explainSimpleBtn.addEventListener("click", async () => {
    await submitPrompt("Explain the key concepts from this document in very simple language.", "eli5");
});

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

    if (!event.dataTransfer.files.length) {
        return;
    }

    fileInput.files = event.dataTransfer.files;
    setUploadStatus(`Selected: ${event.dataTransfer.files[0].name}`);
});

fileInput.addEventListener("change", () => {
    if (fileInput.files.length) {
        setUploadStatus(`Selected: ${fileInput.files[0].name}`);
    }
});

mobileMenuBtn.addEventListener("click", () => {
    document.body.classList.add("sidebar-open");
});

mobileOverlay.addEventListener("click", () => {
    document.body.classList.remove("sidebar-open");
});

async function bootstrap() {
    try {
        const response = await fetch("/history");
        if (response.ok) {
            const data = await response.json();
            if (data.document_name) {
                activeDoc.textContent = `Active file: ${data.document_name}`;
                setChatAvailability(true);
            }
        }
    } catch {
        activeDoc.textContent = "Upload a file to start your contextual conversation.";
    }

    await renderHistory();
    showEmptyState();
}

bootstrap();
