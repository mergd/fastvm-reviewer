import OpenAI from "openai";
import type { EnvConfig } from "../config/env";

export class OpenAIResponsesClient {
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(env: EnvConfig) {
    this.model = env.openAiModel;
    this.client = env.openAiApiKey
      ? new OpenAI({ apiKey: env.openAiApiKey, baseURL: env.openAiBaseUrl })
      : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async createJsonResponse<T>(args: {
    system: string;
    user: string;
    schemaName: string;
    schemaDescription: string;
    schema: Record<string, unknown>;
  }): Promise<T> {
    const client = this.requireClient();

    const response = await client.responses.create({
      model: this.model,
      store: false,
      input: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      text: {
        format: {
          type: "json_schema",
          name: args.schemaName,
          description: args.schemaDescription,
          strict: true,
          schema: args.schema,
        },
      },
    });

    if (!response.output_text) {
      throw new Error("OpenAI Responses API returned no text output");
    }

    return JSON.parse(response.output_text) as T;
  }

  private requireClient(): OpenAI {
    if (!this.client) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    return this.client;
  }
}
