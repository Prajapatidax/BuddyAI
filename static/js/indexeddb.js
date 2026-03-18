const DB_NAME = "BuddyAI_DB";
const STORE_NAME = "chat_sessions";
const DB_VERSION = 1;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: "chat_id" });
                store.createIndex("user_id", "user_id", { unique: false });
                store.createIndex("timestamp", "timestamp", { unique: false });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function saveChat(sessionData) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(sessionData);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

export async function getChatsByUser(userId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const rows = request.result || [];
            const filtered = rows
                .filter((chat) => String(chat.user_id) === String(userId))
                .sort((a, b) => b.timestamp - a.timestamp);
            resolve(filtered);
        };

        request.onerror = () => reject(request.error);
    });
}

export async function getChat(chatId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).get(chatId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

export async function deleteChat(chatId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(chatId);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}
