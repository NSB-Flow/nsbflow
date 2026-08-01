/**
 * Server-only symmetric crypto for CRM OAuth tokens + signed OAuth state.
 * Key material comes from the project secret CRM_TOKEN_ENC_KEY.
 */

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(value: string): Uint8Array<ArrayBuffer> {
  const bin = atob(value);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64url(bytes: Uint8Array): string {
  return b64encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(value: string): Uint8Array<ArrayBuffer> {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  return b64decode(value.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

function secret(): string {
  const raw = process.env["CRM_TOKEN_ENC_KEY"];
  if (!raw) throw new Error("CRM_TOKEN_ENC_KEY não está configurado");
  return raw;
}

async function aesKey(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret()));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptToken(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const key = await aesKey();
  const ct = new Uint8Array(
    (await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext))) as ArrayBuffer,
  );
  const packed = new Uint8Array(new ArrayBuffer(iv.length + ct.length));
  packed.set(iv, 0);
  packed.set(ct, iv.length);
  return b64encode(packed);
}

export async function decryptToken(stored: string): Promise<string> {
  const packed = b64decode(stored);
  const iv = packed.subarray(0, 12);
  const ct = packed.subarray(12);
  const key = await aesKey();
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Signs an OAuth `state` payload so the callback can trust it without a session. */
export async function signState(payload: Record<string, unknown>): Promise<string> {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = new Uint8Array(
    (await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(body))) as ArrayBuffer,
  );
  return `${body}.${b64url(sig)}`;
}

export async function verifyState<T = Record<string, unknown>>(state: string): Promise<T | null> {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(),
    b64urlDecode(sig),
    new TextEncoder().encode(body),
  );
  if (!ok) return null;
  try {
    return JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as T;
  } catch {
    return null;
  }
}
