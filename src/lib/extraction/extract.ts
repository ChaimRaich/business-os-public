import Anthropic from "@anthropic-ai/sdk";
import { AnthropicFoundry } from "@anthropic-ai/foundry-sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ExtractedDocument } from "./schema.ts";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from "./prompt.ts";

export type SourceFile = {
  mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  data: Buffer;
};

export type ExtractionFailure = "not_configured" | "auth" | "rate_limited" | "too_large" | "refused" | "truncated" | "unavailable" | "invalid_output";

export class ExtractionError extends Error {
  readonly reason: ExtractionFailure;

  constructor(reason: ExtractionFailure, message: string) {
    super(message);
    this.reason = reason;
  }
}

const DEFAULT_MODEL = "claude-opus-5-5";

/**
 * Claude through Microsoft Foundry (Azure) when ANTHROPIC_FOUNDRY_* is set,
 * otherwise the Anthropic API. On Foundry the model name is the deployment name.
 */
type ModelClient = { messages: Pick<Anthropic["messages"], "stream"> };

function createModelClient(): { client: ModelClient; model: string } {
  const model = process.env.EXTRACTION_MODEL || DEFAULT_MODEL;
  const foundryTarget = process.env.ANTHROPIC_FOUNDRY_RESOURCE || process.env.ANTHROPIC_FOUNDRY_BASE_URL;
  if (process.env.ANTHROPIC_FOUNDRY_API_KEY && foundryTarget) {
    return { client: new AnthropicFoundry(), model };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { client: new Anthropic(), model };
  }
  throw new ExtractionError(
    "not_configured",
    "No model credentials: set ANTHROPIC_FOUNDRY_API_KEY and ANTHROPIC_FOUNDRY_RESOURCE, or ANTHROPIC_API_KEY.",
  );
}

export function isExtractionConfigured(): boolean {
  try {
    createModelClient();
    return true;
  } catch {
    return false;
  }
}

function toContentBlock(file: SourceFile): Anthropic.ContentBlockParam {
  const data = file.data.toString("base64");
  if (file.mimeType === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  }
  return { type: "image", source: { type: "base64", media_type: file.mimeType, data } };
}

/** Reads one receiving document (all its pages / photos) into structured rows. */
export async function extractDocument(
  files: SourceFile[],
): Promise<{ result: ExtractedDocument; model: string }> {
  const { client, model } = createModelClient();

  let message;
  try {
    message = await client.messages
      .stream({
        model,
        max_tokens: 64000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high", format: zodOutputFormat(ExtractedDocument) },
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [...files.map(toContentBlock), { type: "text", text: EXTRACTION_USER_PROMPT }],
          },
        ],
      })
      .finalMessage();
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new ExtractionError("auth", error.message);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ExtractionError("rate_limited", error.message);
    }
    if (error instanceof Anthropic.APIError && error.status === 413) {
      throw new ExtractionError("too_large", error.message);
    }
    if (error instanceof Anthropic.APIError) {
      throw new ExtractionError("unavailable", `${error.status ?? ""} ${error.message}`.trim());
    }
    throw error;
  }

  if (message.stop_reason === "refusal") {
    throw new ExtractionError("refused", "The model declined to read this document.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new ExtractionError("truncated", "The document produced more output than fits in one response.");
  }
  if (!message.parsed_output) {
    throw new ExtractionError("invalid_output", "The model's answer did not match the expected structure.");
  }
  return { result: message.parsed_output, model: message.model };
}
