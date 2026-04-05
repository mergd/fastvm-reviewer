import type { StoredSecretValue } from "./types";

const KEY_VERSION = 1;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecretValues(
  values: Record<string, string>,
  encryptionSecret: string
): Promise<StoredSecretValue[]> {
  const key = await deriveKey(encryptionSecret);
  const secrets = Object.entries(values)
    .filter(([, value]) => value.length > 0)
    .sort(([left], [right]) => left.localeCompare(right));

  return Promise.all(secrets.map(async ([name, value]) => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv
      },
      key,
      encoder.encode(value)
    );

    return {
      key: name,
      ciphertext: toBase64(new Uint8Array(ciphertext)),
      iv: toBase64(iv),
      keyVersion: KEY_VERSION
    };
  }));
}

export async function decryptSecretValues(
  values: StoredSecretValue[],
  encryptionSecret: string
): Promise<Record<string, string>> {
  const key = await deriveKey(encryptionSecret);
  const entries = await Promise.all(values.map(async (value) => {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(fromBase64(value.iv))
      },
      key,
      toArrayBuffer(fromBase64(value.ciphertext))
    );

    return [value.key, decoder.decode(plaintext)] as const;
  }));

  return Object.fromEntries(entries);
}
