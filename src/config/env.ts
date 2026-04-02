export interface EnvConfig {
  port: number;
  appId: string;
  webhookSecret: string;
  privateKey: string;
  openAiApiKey?: string;
  openAiBaseUrl: string;
  openAiModel: string;
  fastVmApiKey: string;
  fastVmBaseUrl: string;
  baseSnapshotName: string;
  baselineRefreshCronHours: number;
}

export type EnvSource = Record<string, string | undefined>;

function readRequired(source: EnvSource, name: string): string {
  const value = source[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function loadEnv(source: EnvSource = Bun.env as EnvSource): EnvConfig {
  return {
    port: Number(source.PORT ?? "3000"),
    appId: readRequired(source, "GITHUB_APP_ID"),
    webhookSecret: readRequired(source, "GITHUB_WEBHOOK_SECRET"),
    privateKey: readRequired(source, "GITHUB_APP_PRIVATE_KEY"),
    openAiApiKey: source.OPENAI_API_KEY,
    openAiBaseUrl: source.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    openAiModel: source.OPENAI_MODEL ?? "gpt-5.4",
    fastVmApiKey: readRequired(source, "FASTVM_API_KEY"),
    fastVmBaseUrl: source.FASTVM_BASE_URL ?? "https://api.fastvm.org",
    baseSnapshotName: source.FASTVM_BASE_SNAPSHOT_NAME ?? "reviewer-base",
    baselineRefreshCronHours: Number(source.BASELINE_REFRESH_HOURS ?? "24")
  };
}
