import type { D1DatabaseLike } from "./d1";

export interface WorkerEnv {
  [key: string]: unknown;
  RUNNER_BASE_URL?: string;
  RUNNER_SHARED_SECRET?: string;
  ONBOARDING_ENCRYPTION_KEY?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  DB?: D1DatabaseLike;
}
