import type { SetupAnalysis, SetupDocument } from "../types";
import { OpenAIResponsesClient } from "../openai/responses-client";

const SETUP_ANALYSIS_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["profile", "confidence", "rationale", "missingInformation"],
  properties: {
    profile: {
      type: "object",
      additionalProperties: false,
      properties: {
        packageManager: {
          type: "string",
          enum: ["bun", "npm", "pnpm", "yarn", "unknown"]
        },
        rootDir: { type: "string" },
        installCommand: { type: "string" },
        lintCommand: { type: "string" },
        typecheckCommand: { type: "string" },
        testCommand: { type: "string" },
        appBootCommand: { type: "string" },
        smokeTestCommand: { type: "string" },
        envKeys: {
          type: "array",
          items: { type: "string" }
        },
        vmBaseSnapshot: { type: "string" },
        vmMachine: { type: "string" },
        setupNotes: { type: "string" }
      }
    },
    confidence: {
      type: "string",
      enum: ["low", "medium", "high"]
    },
    rationale: {
      type: "string"
    },
    missingInformation: {
      type: "array",
      items: { type: "string" }
    }
  }
};

function renderDocuments(documents: SetupDocument[]): string {
  return documents
    .map((document) => [
      `FILE: ${document.path}`,
      "```",
      document.content,
      "```"
    ].join("\n"))
    .join("\n\n");
}

export class SetupAnalyzer {
  constructor(private readonly responses: OpenAIResponsesClient) {}

  isConfigured(): boolean {
    return this.responses.isConfigured();
  }

  async analyze(args: {
    owner: string;
    repo: string;
    rootFiles: string[];
    documents: SetupDocument[];
  }): Promise<SetupAnalysis> {
    const system = [
      "You are analyzing a software repository for a cloud development agent.",
      "Infer the minimum setup needed to install dependencies, boot the app if applicable, run validation commands, and identify environment variables.",
      "Do not assume the repository is JavaScript, Node, or web-specific.",
      "Use exact commands from the repository when available, including Python, Rust, Go, Make, shell, Docker, or other toolchains.",
      "Prefer exact commands from repository files over guesses.",
      "If information is missing, omit uncertain commands instead of inventing them, and report the gaps in missingInformation.",
      "The response must be valid JSON matching the provided schema."
    ].join(" ");
    const user = [
      `Repository: ${args.owner}/${args.repo}`,
      `Root files: ${args.rootFiles.join(", ") || "(none)"}`,
      "",
      "Candidate setup documents:",
      renderDocuments(args.documents)
    ].join("\n");
    const result = await this.responses.createJsonResponse<SetupAnalysis>({
      system,
      user,
      schemaName: "repo_setup_analysis",
      schemaDescription: "Structured repository setup analysis for a cloud coding agent",
      schema: SETUP_ANALYSIS_SCHEMA
    });

    return {
      ...result,
      profile: {
        ...result.profile,
        setupSource: "openai"
      }
    };
  }
}
