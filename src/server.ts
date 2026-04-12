import { createAppContext } from "./app";
import { loadEnv } from "./config/env";
import { createRequestHandler } from "./request-handler";
import { FastVmClient } from "./fastvm/client";
import { OnboardingService } from "./services/onboarding-service";
import { SetupSessionStore } from "./services/setup-session-store";

const BASELINE_REFRESH_MS = 24 * 60 * 60 * 1000;

const env = loadEnv();
const app = createAppContext(
  Bun.env,
  new FastVmClient(env.fastVmApiKey, env.fastVmBaseUrl),
);
const setupSessions = new SetupSessionStore();
const handleRequest = createRequestHandler(app, setupSessions);
const onboarding = new OnboardingService(app);

setInterval(() => {
  void onboarding.refreshBaselines().catch((error) => {
    console.error("Scheduled baseline refresh failed", error);
  });
}, BASELINE_REFRESH_MS);

Bun.serve({
  port: app.env.port,
  fetch: handleRequest,
});

console.log(`FastVM reviewer listening on :${app.env.port}`);
