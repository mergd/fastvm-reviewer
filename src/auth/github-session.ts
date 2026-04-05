const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface GitHubUserSession {
  accessToken: string;
  login: string;
  organizations: string[];
  avatarUrl?: string;
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptGitHubSession(
  session: GitHubUserSession,
  encryptionSecret: string
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(encryptionSecret);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv
    },
    key,
    encoder.encode(JSON.stringify(session))
  );

  return `${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptGitHubSession(
  value: string | undefined,
  encryptionSecret: string
): Promise<GitHubUserSession | undefined> {
  if (!value) {
    return undefined;
  }

  const [ivEncoded, ciphertextEncoded] = value.split(".");
  if (!ivEncoded || !ciphertextEncoded) {
    return undefined;
  }

  try {
    const key = await deriveKey(encryptionSecret);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(fromBase64(ivEncoded))
      },
      key,
      toArrayBuffer(fromBase64(ciphertextEncoded))
    );

    return JSON.parse(decoder.decode(plaintext)) as GitHubUserSession;
  } catch {
    return undefined;
  }
}
