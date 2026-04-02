# Cloud Agents

This repository should be reviewable by a cloud-hosted coding agent with minimal guessing.

## User Story
When a maintainer connects this repo to the FastVM PR Reviewer, the cloud agent should be able to determine how to install dependencies, start the app, understand required environment variables, and validate a healthy baseline before reviewing pull requests.

## VM Base
reviewer-base

## VM Machine
c1m2

## Root Directory
/workspace/repo

## Install
bun install

## Dev Server
bun run dev

## Typecheck
bun run typecheck

## Environment Variables
- GITHUB_APP_ID
- GITHUB_WEBHOOK_SECRET
- GITHUB_APP_PRIVATE_KEY
- OPENAI_API_KEY
- FASTVM_API_KEY
- FASTVM_BASE_URL
- FASTVM_BASE_SNAPSHOT_NAME
- BASELINE_REFRESH_HOURS

## Notes
The reviewer service itself does not expose a user-facing web app yet, so cloud onboarding should focus on dependency install, successful server boot, and a passing typecheck as the minimum healthy baseline. Repos reviewed by this service should also add their own `cloud-agents.md` so the cloud agent can prefer checked-in setup instructions over heuristics or model inference. When `cloud-agents.md` is missing, the service can fall back to OpenAI Responses API setup analysis over WebSocket using an API key rather than relying on a local Codex app-server binary. Actual environment variable values should be configured through a secret path such as Cloudflare secrets, not committed into this file.
