import { createAppContext } from "./app";
import { createRequestHandler } from "./request-handler";
import { OnboardingService } from "./services/onboarding-service";

const app = createAppContext();
const handleRequest = createRequestHandler(app);
const onboarding = new OnboardingService(app);

setInterval(() => {
  void onboarding.refreshBaselines().catch((error) => {
    console.error("Scheduled baseline refresh failed", error);
  });
}, app.env.baselineRefreshCronHours * 60 * 60 * 1000);

Bun.serve({
  port: app.env.port,
  fetch: handleRequest
});

console.log(`FastVM reviewer listening on :${app.env.port}`);
