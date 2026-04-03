import { Webhooks } from "@octokit/webhooks";
import { App } from "octokit";
import type { EnvConfig } from "../config/env";

export class GitHubAppAuth {
  private readonly app: InstanceType<typeof App>;
  private readonly webhooks: Webhooks;

  constructor(private readonly env: EnvConfig) {
    this.app = new App({
      appId: env.appId,
      privateKey: env.privateKey.includes("\\n") ? env.privateKey.replaceAll("\\n", "\n") : env.privateKey
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
}
