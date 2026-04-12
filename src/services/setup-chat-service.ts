import OpenAI from "openai";
import type { AppContext } from "../app";

const SYSTEM_PROMPT = `You are a review agent configuration assistant. Your job is to help the user set up automated PR reviews for their repository.

You have access to the repository's files and structure. When the user describes their project, you should:
1. Suggest the correct commands for install, lint, typecheck, test, app boot, and smoke test
2. Identify the root directory (especially important for monorepos)
3. Note any environment variables the project needs
4. Flag anything unusual about the project setup

When you determine a profile field should change, output a structured update in this exact format on its own line:
<profile_update field="fieldName" value="the value" />

Valid field names: rootDir, installCommand, lintCommand, typecheckCommand, testCommand, appBootCommand, smokeTestCommand, envKeys, vmBaseSnapshot, vmMachine, setupNotes

Be concise. Don't repeat the full config back unless asked. Focus on what matters for getting the reviewer working.`;

type ChatRequest = {
  repoFullName: string;
  installationId: number;
  messages: Array<{ role: string; content: string }>;
};

export class SetupChatService {
  private openai: OpenAI | undefined;

  constructor(private readonly app: AppContext) {
    if (app.env.openAiApiKey) {
      this.openai = new OpenAI({ apiKey: app.env.openAiApiKey });
    }
  }

  handleStream(request: ChatRequest): Response {
    if (!this.openai) {
      return Response.json({ error: "OpenAI is not configured" }, { status: 503 });
    }

    const openai = this.openai;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start: async (controller) => {
        const emit = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        try {
          let contextMessage = "";
          if (request.messages.length <= 1) {
            try {
              const { documents } = await this.app.githubInstallations.collectSetupDocuments(
                request.installationId,
                request.repoFullName.split("/")[0],
                request.repoFullName.split("/")[1]
              );
              if (documents.length > 0) {
                contextMessage = "Here are the key files from the repository:\n\n" +
                  documents.map((d) => `### ${d.path}\n\`\`\`\n${d.content.slice(0, 3000)}\n\`\`\``).join("\n\n");
              }
            } catch {
              // proceed without context
            }
          }

          const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
            { role: "system", content: SYSTEM_PROMPT },
          ];

          if (contextMessage) {
            openaiMessages.push({ role: "system", content: contextMessage });
          }

          for (const msg of request.messages) {
            openaiMessages.push({
              role: msg.role as "user" | "assistant",
              content: msg.content
            });
          }

          const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: openaiMessages,
            stream: true,
          });

          let fullText = "";
          for await (const chunk of completion) {
            const text = chunk.choices[0]?.delta?.content;
            if (text) {
              fullText += text;
              emit("token", { text });

              const updateMatch = fullText.match(/<profile_update field="(\w+)" value="([^"]*)" \/>/);
              if (updateMatch) {
                emit("profile:update", { field: updateMatch[1], value: updateMatch[2] });
                fullText = fullText.replace(updateMatch[0], "");
              }
            }
          }

          emit("done", {});
        } catch (error) {
          emit("error", { message: error instanceof Error ? error.message : String(error) });
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "connection": "keep-alive"
      }
    });
  }
}
