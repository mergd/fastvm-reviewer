import { createPrivateKey } from "node:crypto";
import { Webhooks } from "@octokit/webhooks";
import { App } from "octokit";
import type { EnvConfig } from "../config/env";

function normalizePrivateKey(privateKey: string): string {
  const pem = privateKey.includes("\\n") ? privateKey.replaceAll("\\n", "\n") : privateKey;
  if (!pem.includes("BEGIN RSA PRIVATE KEY")) {
    return pem;
  }

  return createPrivateKey({ key: pem, format: "pem" })
    .export({ type: "pkcs8", format: "pem" })
    .toString();
}

export class GitHubAppAuth {
  private readonly app: InstanceType<typeof App>;
  private readonly webhooks: Webhooks;

  constructor(private readonly env: EnvConfig) {
    this.app = new App({
      appId: env.appId,
      privateKey: normalizePrivateKey(env.privateKey)
    });
    this.webhooks = new Webhooks({
      secret: env.webhookSecret
    });
  }

  async verifyWebhookSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
    if (!signatureHeader?.startsWith("sha256=")) {
      return false;
    }

    return this.webhooks.verify(rawBody, signatureHeader);
  }

  async createInstallationToken(installationId: number): Promise<string> {
    const authentication = await this.app.octokit.auth({
      type: "installation",
      installationId
    }) as { token: string };
    return authentication.token;
  }

  async getInstallationOctokit(installationId: number) {
    return this.app.getInstallationOctokit(installationId);
  }

  async listInstallations(): Promise<Array<{
    id: number;
    accountLogin: string;
    targetType: string;
  }>> {
    const response = await this.app.octokit.request("GET /app/installations", {
      per_page: 100
    });

    return response.data.map((installation) => ({
      id: installation.id,
      accountLogin: installation.account?.login ?? "",
      targetType: installation.target_type
    }));
  }
}
