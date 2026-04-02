import { createAppContext } from "./app";
import { createRequestHandler } from "./request-handler";

export default {
  async fetch(request: Request, env: Record<string, string | undefined>): Promise<Response> {
    const app = createAppContext(env);
    const handleRequest = createRequestHandler(app);
    return handleRequest(request);
  },
  async scheduled(_controller: unknown, env: Record<string, string | undefined>): Promise<void> {
    const app = createAppContext(env);
    const { OnboardingService } = await import("./services/onboarding-service");
    const onboarding = new OnboardingService(app);
    await onboarding.refreshBaselines();
  }
};
