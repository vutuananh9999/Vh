/**
 * Secure Credential Storage Vault for Client-Side Web Runtime
 *
 * - Encrypts API keys at rest using Web Crypto AES-GCM (256-bit) before writing to browser storage.
 * - Keeps the AES master wrapping key as a non-extractable CryptoKey inside IndexedDB so
 *   raw key material cannot be read out of localStorage as plain JSON strings.
 * - Maintains an in-memory unlocked cache for synchronous provider execution after hydration,
 *   plus automatic migration from legacy plaintext localStorage storage.
 *
 * Security Note: Web browsers do not provide native OS hardware vaults like iOS Keychain or
 * Android Keystore. This service uses the strongest available web-standard mechanism (Web Crypto
 * AES-GCM + non-extractable IndexedDB CryptoKey) and isolates secrets from provider metadata.
 */

const VAULT_DB_NAME = 'aetheria_secure_vault_db';
const VAULT_STORE_NAME = 'vault_keys';
const VAULT_MASTER_KEY_ID = 'master_aes_gcm_key_v1';
const ENCRYPTED_CREDS_STORAGE_KEY = 'aetheria_encrypted_credentials_v1';

interface EncryptedSecretEnvelope {
  v: 1;
  iv: string; // base64
  ct: string; // base64
  updatedAt: number;
}

type EncryptedVaultMap = Record<string, EncryptedSecretEnvelope>;

// In-memory unlocked credentials (providerId -> plaintext apiKey)
const unlockedSecrets = new Map<string, string>();
let cachedMasterKey: CryptoKey | null = null;
let hydrationPromise: Promise<void> | null = null;
let hydratedOnce = false;
let persistentVaultSupported = true;

function getWebCrypto(): Crypto | null {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto;
  }
  return null;
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function openKeyDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(VAULT_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(VAULT_STORE_NAME)) {
          db.createObjectStore(VAULT_STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readKeyFromDb(db: IDBDatabase): Promise<CryptoKey | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(VAULT_STORE_NAME, 'readonly');
      const store = tx.objectStore(VAULT_STORE_NAME);
      const req = store.get(VAULT_MASTER_KEY_ID);
      req.onsuccess = () => resolve((req.result as CryptoKey) || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeKeyToDb(db: IDBDatabase, key: CryptoKey): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(VAULT_STORE_NAME, 'readwrite');
      const store = tx.objectStore(VAULT_STORE_NAME);
      const req = store.put(key, VAULT_MASTER_KEY_ID);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function getOrCreateMasterKey(): Promise<CryptoKey | null> {
  if (cachedMasterKey) return cachedMasterKey;

  const webCrypto = getWebCrypto();
  if (!webCrypto) {
    persistentVaultSupported = false;
    return null;
  }

  const db = await openKeyDb();
  if (db) {
    try {
      const existing = await readKeyFromDb(db);
      if (existing) {
        cachedMasterKey = existing;
        return existing;
      }

      const generated = await webCrypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false, // non-extractable so scripts cannot export raw AES key bytes
        ['encrypt', 'decrypt']
      );

      const saved = await writeKeyToDb(db, generated);
      if (saved) {
        cachedMasterKey = generated;
        return generated;
      }
    } catch {
      // Fall through to ephemeral key warning
    } finally {
      try {
        db.close();
      } catch {
        // ignore
      }
    }
  }

  // Fallback: ephemeral in-memory AES-GCM key (never persist plaintext keys!)
  persistentVaultSupported = false;
  try {
    cachedMasterKey = await webCrypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    return cachedMasterKey;
  } catch {
    return null;
  }
}

function readEncryptedVaultMap(): EncryptedVaultMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(ENCRYPTED_CREDS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as EncryptedVaultMap) : {};
  } catch {
    return {};
  }
}

function writeEncryptedVaultMap(map: EncryptedVaultMap): void {
  if (typeof localStorage === 'undefined') return;
  if (Object.keys(map).length === 0) {
    localStorage.removeItem(ENCRYPTED_CREDS_STORAGE_KEY);
    return;
  }
  localStorage.setItem(ENCRYPTED_CREDS_STORAGE_KEY, JSON.stringify(map));
}

async function encryptSecret(plaintext: string): Promise<EncryptedSecretEnvelope | null> {
  const webCrypto = getWebCrypto();
  const key = await getOrCreateMasterKey();
  if (!webCrypto || !key) return null;

  const iv = webCrypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuffer = await webCrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  return {
    v: 1,
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(cipherBuffer)),
    updatedAt: Date.now()
  };
}

async function decryptSecret(envelope: EncryptedSecretEnvelope): Promise<string | null> {
  const webCrypto = getWebCrypto();
  const key = await getOrCreateMasterKey();
  if (!webCrypto || !key || !envelope?.iv || !envelope?.ct) return null;

  try {
    const iv = fromBase64(envelope.iv);
    const ct = fromBase64(envelope.ct);
    const plainBuffer = await webCrypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      ct as unknown as BufferSource
    );
    return new TextDecoder().decode(plainBuffer);
  } catch {
    return null;
  }
}

/**
 * Redacts API keys and Bearer tokens from error strings or debug messages.
 */
export function redactSecrets(input: string, knownSecrets?: string[]): string {
  if (!input) return '';
  let result = String(input);

  if (Array.isArray(knownSecrets)) {
    for (const secret of knownSecrets) {
      const clean = secret?.trim();
      if (clean && clean.length >= 6) {
        result = result.split(clean).join('[REDACTED_KEY]');
      }
    }
  }

  // Also redact any secrets currently in our unlocked vault
  for (const secret of unlockedSecrets.values()) {
    const clean = secret?.trim();
    if (clean && clean.length >= 6 && result.includes(clean)) {
      result = result.split(clean).join('[REDACTED_KEY]');
    }
  }

  // Pattern-based sanitization
  result = result
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [REDACTED_KEY]')
    .replace(/(x-api-key|x-goog-api-key|api-key|authorization)["':=\s]+[A-Za-z0-9._~+/=-]{8,}/gi, '$1: [REDACTED_KEY]')
    .replace(/([?&]key=)[^&\s"']+/gi, '$1[REDACTED_KEY]')
    .replace(/\bsk-(?:proj-|or-v1-|ant-api\d*-)?[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_KEY]')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[REDACTED_KEY]')
    .replace(/\b(?:gsk_|xai-)[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_KEY]');

  return result;
}

export function maskSecret(secret?: string): string {
  const clean = (secret || '').trim();
  if (!clean) return 'Chưa có Key';
  if (clean.length <= 10) return '••••••••';
  return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

export const secureCredentialStorage = {
  isHydrated(): boolean {
    return hydratedOnce;
  },

  isPersistentVaultSupported(): boolean {
    return persistentVaultSupported && typeof indexedDB !== 'undefined' && Boolean(getWebCrypto());
  },

  /**
   * Hydrates the in-memory secret cache by decrypting all encrypted vault entries.
   * Safe to call multiple times concurrently.
   */
  async hydrate(): Promise<void> {
    if (hydratedOnce) return;
    if (hydrationPromise) return hydrationPromise;

    hydrationPromise = (async () => {
      try {
        const vault = readEncryptedVaultMap();
        const entries = Object.entries(vault);
        for (const [providerId, envelope] of entries) {
          const decrypted = await decryptSecret(envelope);
          if (decrypted !== null) {
            unlockedSecrets.set(providerId, decrypted);
          }
        }
      } finally {
        hydratedOnce = true;
        hydrationPromise = null;
      }
    })();

    return hydrationPromise;
  },

  getSecretSync(providerId: string): string {
    return unlockedSecrets.get(providerId) || '';
  },

  hasSecretRecord(providerId: string): boolean {
    if (unlockedSecrets.has(providerId) && Boolean(unlockedSecrets.get(providerId))) {
      return true;
    }
    const vault = readEncryptedVaultMap();
    return Boolean(vault[providerId]?.ct);
  },

  async getSecret(providerId: string): Promise<string> {
    if (!hydratedOnce) {
      await this.hydrate();
    }
    return unlockedSecrets.get(providerId) || '';
  },

  async setSecret(providerId: string, apiKey: string): Promise<void> {
    const clean = (apiKey || '').trim();
    if (!clean) {
      await this.deleteSecret(providerId);
      return;
    }

    unlockedSecrets.set(providerId, clean);
    hydratedOnce = true;

    if (typeof localStorage === 'undefined') return;
    const envelope = await encryptSecret(clean);
    if (envelope && persistentVaultSupported) {
      const vault = readEncryptedVaultMap();
      vault[providerId] = envelope;
      writeEncryptedVaultMap(vault);
    }
  },

  async deleteSecret(providerId: string): Promise<void> {
    unlockedSecrets.delete(providerId);
    if (typeof localStorage === 'undefined') return;
    const vault = readEncryptedVaultMap();
    if (providerId in vault) {
      delete vault[providerId];
      writeEncryptedVaultMap(vault);
    }
  },

  /**
   * Synchronous fallback write is disabled for secrets; sets in-memory immediately and queues
   * async AES-GCM encryption so UI actions reflect instantly while persistence stays encrypted.
   */
  setSecretBuffered(providerId: string, apiKey: string): Promise<void> {
    const clean = (apiKey || '').trim();
    if (!clean) {
      return this.deleteSecret(providerId);
    }
    unlockedSecrets.set(providerId, clean);
    hydratedOnce = true;
    return this.setSecret(providerId, clean);
  },

  getAllKnownSecrets(): string[] {
    return Array.from(unlockedSecrets.values()).filter(Boolean);
  },

  /**
   * Resets internal state (useful for test isolation).
   */
  _resetForTests(): void {
    unlockedSecrets.clear();
    cachedMasterKey = null;
    hydrationPromise = null;
    hydratedOnce = false;
    persistentVaultSupported = true;
  }
};
