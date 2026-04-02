# FastVM PR Reviewer

GitHub App-driven PR reviewer that restores repo-specific FastVM baselines, checks out PRs, runs code inspection plus verification commands, and reports back through GitHub check runs and review comments.

## What It Does

- Connects repositories through a GitHub App flow
- Detects a starter review profile for each repo
- Prefers checked-in `cloud-agents.md` instructions over heuristics when repos provide them
- Uses the OpenAI Responses API over WebSocket with an API key to improve setup inference when repo-owned instructions are missing
- Includes an interactive setup CLI for generating or updating `cloud-agents.md`
- Bootstraps and validates a repo-specific FastVM baseline snapshot
- Restores the baseline for PR review jobs
- Runs diff inspection, lint, typecheck, test, and optional smoke commands
- Publishes results back to GitHub

## Repo Onboarding Story

The intended onboarding flow is:

1. A maintainer installs the GitHub App on a repository.
2. The service inspects the repo and looks first for `cloud-agents.md`.
3. If `cloud-agents.md` exists, the service uses it as the primary source for install commands, app boot commands, env vars, and setup notes.
4. If it does not exist, the service gathers candidate setup files and asks the OpenAI Responses API for a structured setup plan.
5. If model analysis is unavailable or fails, the service falls back to lightweight facts only.
6. If the repo still has no real setup commands, onboarding stops and asks for repo-owned setup instructions instead of inventing a Node-style workflow.
7. The repo is bootstrapped and validated in a FastVM baseline before PR reviews are enabled.

This path does not require the `codex` binary or Codex app-server. It is API-key based today. App-server can be layered on later for a richer interactive onboarding experience.

Repos being reviewed should check in a `cloud-agents.md` file so setup is owned by the repo rather than guessed by the service.

## Interactive Setup

Use the setup wizard to ask the user for help instead of guessing:

```sh
bun run setup:wizard -- --repo-path /path/to/target-repo
```

The wizard prompts for:
- VM base snapshot
- VM machine type
- root directory
- install, boot, and validation commands
- environment variable names
- setup notes

It writes a `cloud-agents.md` file into the target repo. Secret values should be configured separately through your hosting or secrets system.

## Setup

1. Copy `.env.example` to `.env` and fill in the GitHub App and FastVM credentials.
2. Install dependencies:

```sh
bun install
pip3 install fastvm
```

3. Build the provider-level base snapshot:

```sh
bun run build:snapshot
```

4. Start the service:

```sh
bun run dev
```

5. For a Cloudflare-hosted API surface, use:

```sh
bun run dev:worker
```

## HTTP Endpoints

- `GET /health`
- `POST /webhooks/github`
- `POST /repos/:owner/:repo/connect`
- `POST /repos/:owner/:repo/bootstrap`
- `POST /internal/baselines/refresh`

## Notes

- The service keeps state in memory for now; add durable storage before production use.
- FastVM actions are executed through `scripts/fastvm_bridge.py`, which uses the official Python SDK.
- OpenAI setup analysis currently uses the Responses API over WebSocket with an API key.
- Heuristics are intentionally conservative. If a repo does not provide enough evidence for install and validation commands, the service should stop and ask for `cloud-agents.md` rather than assume a JavaScript workflow.
- The hosted API surface now has a Cloudflare Worker entrypoint in `src/worker.ts` and `wrangler.jsonc`, while the Bun server remains useful for local development.
