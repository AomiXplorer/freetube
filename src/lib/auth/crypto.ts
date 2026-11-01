/**
 * AES-256-GCM sealing for everything we keep on the client.
 *
 * The key is derived from SESSION_SECRET, so a value sealed by one deployment
 * cannot be read by another. Plaintext never touches a log line.
 */
const IV_BYTES = 12;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    // A short/absent secret still works locally, but sessions would not survive
    // a redeploy - warn once per process instead of failing a user request.
    if (!warned) {
      warned = true;
      console.warn("[auth] SESSION_SECRET missing or too short; using an ephemeral fallback key.");
    }
    return "freetube-development-only-secret-change-me";
  }
  return secret;
}

let warned = false;

async function deriveKey(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sessionSecret()));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function sealString(value: string): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return toBase64Url(combined);
}

export async function openString(payload: string): Promise<string | null> {
  try {
    const combined = fromBase64Url(payload);
    const iv = combined.slice(0, IV_BYTES);
    const data = combined.slice(IV_BYTES);
    const key = await deriveKey();
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

export async function sealJson(value: unknown): Promise<string> {
  return sealString(JSON.stringify(value));
}

export async function openJson<T>(payload: string): Promise<T | null> {
  const raw = await openString(payload);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
