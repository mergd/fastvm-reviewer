export const CLOUD_AGENTS_PATH = "cloud-agents.md";
export const REVIEWER_WORKFLOW_PATH = ".github/workflows/cloud-reviewer.yml";

export function renderReviewerWorkflow(): string {
  return [
    "name: Cloud Reviewer",
    "",
    "on:",
    "  pull_request:",
    "    types: [opened, reopened, synchronize]",
    "  workflow_dispatch:",
    "",
    "jobs:",
    "  reviewer-opt-in:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: Confirm Cloud Reviewer opt-in",
    "        run: echo \"Cloud Reviewer is enabled for this repository. Reviews run via the GitHub App once onboarding is complete.\""
  ].join("\n");
}
