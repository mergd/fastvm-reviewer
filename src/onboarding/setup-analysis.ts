import OpenAI from "openai";
import type { SetupAnalysis, SetupDocument } from "../types";

const DEFAULT_MODEL = "gpt-5.4";
const PROFILE_KEYS = [
  "packageManager",
  "rootDir",
  "installCommand",
  "lintCommand",
  "typecheckCommand",
  "testCommand",
  "appBootCommand",
  "smokeTestCommand",
  "envKeys",
  "vmBaseSnapshot",
  "vmMachine",
  "setupNotes"
] as const;

const SETUP_ANALYSIS_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["profile", "confidence", "rationale", "missingInformation"],
  properties: {
    profile: {
      type: "object",
      additionalProperties: false,
      required: [...PROFILE_KEYS],
      properties: {
        packageManager: {
          type: ["string", "null"],
          enum: ["bun", "npm", "pnpm", "yarn", "unknown", null]
        },
        rootDir: { type: ["string", "null"] },
        installCommand: { type: ["string", "null"] },
        lintCommand: { type: ["string", "null"] },
        typecheckCommand: { type: ["string", "null"] },
        testCommand: { type: ["string", "null"] },
        appBootCommand: { type: ["string", "null"] },
        smokeTestCommand: { type: ["string", "null"] },
        envKeys: {
          type: ["array", "null"],
          items: { type: "string" }
        },
        vmBaseSnapshot: { type: ["string", "null"] },
        vmMachine: { type: ["string", "null"] },
        setupNotes: { type: ["string", "null"] }
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

const SYSTEM_PROMPT = [
  "You are analyzing a software repository for a cloud development agent.",
  "Infer the minimum setup needed to install dependencies, boot the app if applicable, run validation commands, and identify environment variables.",
  "Do not assume the repository is JavaScript, Node, or web-specific.",
  "Use exact commands from the repository when available, including Python, Rust, Go, Make, shell, Docker, or other toolchains.",
  "Prefer exact commands from repository files over guesses.",
  "If information is missing, omit uncertain commands instead of inventing them, and report the gaps in missingInformation.",
  "The response must be valid JSON matching the provided schema."
].join(" ");

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

function compactNullableProfile(profile: Record<string, unknown>): SetupAnalysis["profile"] {
  const normalized: SetupAnalysis["profile"] = {};

  for (const [key, value] of Object.entries(profile)) {
    if (value !== null) {
      normalized[key as keyof SetupAnalysis["profile"]] = value as never;
    }
  }

  return normalized;
}

export class SetupAnalyzer {
  private readonly client: OpenAI | null;

  constructor(apiKey?: string) {
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async analyze(args: {
    owner: string;
    repo: string;
    rootFiles: string[];
    documents: SetupDocument[];
  }): Promise<SetupAnalysis> {
    if (!this.client) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const user = [
      `Repository: ${args.owner}/${args.repo}`,
      `Root files: ${args.rootFiles.join(", ") || "(none)"}`,
      "",
      "Candidate setup documents:",
      renderDocuments(args.documents)
    ].join("\n");

    const response = await this.client.responses.create({
      model: DEFAULT_MODEL,
      store: false,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "repo_setup_analysis",
          description: "Structured repository setup analysis for a cloud coding agent",
          strict: true,
          schema: SETUP_ANALYSIS_SCHEMA,
        },
      },
    });

    if (!response.output_text) {
      throw new Error("OpenAI Responses API returned no text output");
    }

    const result = JSON.parse(response.output_text) as SetupAnalysis & {
      profile: Record<string, unknown>;
    };

    return {
      ...result,
      profile: {
        ...compactNullableProfile(result.profile),
        setupSource: "openai",
      },
    };
  }
}
