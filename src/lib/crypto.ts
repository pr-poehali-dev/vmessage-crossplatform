/**
 * E2EE для V-message: ECDH (P-256) для обмена ключами + AES-256-GCM для шифрования.
 * Приватный ключ хранится только в IndexedDB устройства, никогда не покидает его.
 */

const DB_NAME = "vmsg_e2ee";
const DB_VERSION = 1;
const STORE = "keys";
const KEY_ID = "device_keypair";

// ── IndexedDB ──────────────────────────────────────────────────────────────────
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(key: string): Promise<CryptoKeyPair | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(key: string, value: CryptoKeyPair): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Ключевая пара устройства ───────────────────────────────────────────────────
export async function getOrCreateKeyPair(): Promise<CryptoKeyPair> {
  const existing = await dbGet(KEY_ID);
  if (existing) return existing;

  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false, // приватный ключ неэкспортируемый
    ["deriveKey"]
  );
  await dbPut(KEY_ID, pair);
  return pair;
}

// Экспортируем публичный ключ в Base64 для отправки на сервер
export async function exportPublicKey(pair: CryptoKeyPair): Promise<string> {
  const raw = await crypto.subtle.exportKey("spki", pair.publicKey);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

// Импортируем публичный ключ собеседника из Base64
async function importPublicKey(b64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "spki", raw.buffer,
    { name: "ECDH", namedCurve: "P-256" },
    false, ["deriveKey"]
  );
}

// ── Вывод общего AES-ключа через ECDH ─────────────────────────────────────────
async function deriveAesKey(myPrivate: CryptoKey, theirPublic: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPublic },
    myPrivate,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ── Кэш AES-ключей (chatId → CryptoKey) ───────────────────────────────────────
const aesCache = new Map<string, CryptoKey>();

export async function getSharedKey(
  myPair: CryptoKeyPair,
  partnerPublicB64: string,
  cacheKey: string
): Promise<CryptoKey> {
  if (aesCache.has(cacheKey)) return aesCache.get(cacheKey)!;
  const theirPub = await importPublicKey(partnerPublicB64);
  const aes = await deriveAesKey(myPair.privateKey, theirPub);
  aesCache.set(cacheKey, aes);
  return aes;
}

// ── Шифрование / расшифровка ───────────────────────────────────────────────────
const ENC_PREFIX = "e2e:";

export async function encryptText(aesKey: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    enc.encode(plaintext)
  );
  // Формат: base64(iv + ciphertext)
  const combined = new Uint8Array(iv.byteLength + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.byteLength);
  return ENC_PREFIX + btoa(String.fromCharCode(...combined));
}

export async function decryptText(aesKey: CryptoKey, ciphertext: string): Promise<string> {
  if (!ciphertext.startsWith(ENC_PREFIX)) return ciphertext; // уже расшифровано/не зашифровано
  const combined = Uint8Array.from(atob(ciphertext.slice(ENC_PREFIX.length)), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, data);
  return new TextDecoder().decode(plainBuf);
}

export function isEncrypted(text: string): boolean {
  return typeof text === "string" && text.startsWith(ENC_PREFIX);
}

// ── Хелпер: доступно ли E2EE в браузере ──────────────────────────────────────
export function e2eeAvailable(): boolean {
  return !!(
    window.crypto?.subtle &&
    window.indexedDB &&
    typeof CryptoKey !== "undefined"
  );
}
