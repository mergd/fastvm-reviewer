import { createHmac, createSign } from "node:crypto";
import type { EnvConfig } from "../config/env";

const GITHUB_API_URL = "https://api.github.com";

function normalizePrivateKey(privateKey: string): string {
  return privateKey.includes("\\n") ? privateKey.replaceAll("\\n", "\n") : privateKey;
}

export class GitHubAppAuth {
  constructor(private readonly env: EnvConfig) {}

  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
    if (!signatureHeader?.startsWith("sha256=")) {
      return false;
    }

    const expected = createHmac("sha256", this.env.webhookSecret).update(rawBody).digest("hex");
    const actual = signatureHeader.slice("sha256=".length);

    return expected === actual;
  }

  async createInstallationToken(installationId: number): Promise<string> {
    const jwt = this.createAppJwt();
    const response = await fetch(`${GITHUB_API_URL}/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${jwt}`,
        "x-github-api-version": "2022-11-28"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to create installation token: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json() as { token: string };
    return payload.token;
  }

  async request<T>(
    path: string,
    init: RequestInit,
    installationId: number
  ): Promise<T> {
    const token = await this.createInstallationToken(installationId);
    const response = await fetch(`${GITHUB_API_URL}${path}`, {
      ...init,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
        ...(init.headers ?? {})
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API request failed: ${response.status} ${await response.text()}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return await response.json() as T;
  }

  private createAppJwt(): string {
    const now = Math.floor(Date.now() / 1000);
    const header = this.encode({
      alg: "RS256",
      typ: "JWT"
    });
    const payload = this.encode({
      iat: now - 60,
      exp: now + 600,
      iss: this.env.appId
    });
    const unsignedToken = `${header}.${payload}`;
    const signer = createSign("RSA-SHA256");
    signer.update(unsignedToken);
    signer.end();
    const signature = signer
      .sign(normalizePrivateKey(this.env.privateKey))
      .toString("base64url");

    return `${unsignedToken}.${signature}`;
  }

  private encode(value: Record<string, string | number>): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
  }
}
