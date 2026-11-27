import Anthropic from "@anthropic-ai/sdk";
import { AnthropicFoundry } from "@anthropic-ai/foundry-sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { ExtractedDocument } from "./schema.ts";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from "./prompt.ts";
import { renderPdfPages } from "./pdf.ts";

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

type ClaudeClient = { messages: Pick<Anthropic["messages"], "stream"> };

/**
 * Which model reads the documents, decided by the credentials that are set:
 * 1. Claude through Microsoft Foundry (ANTHROPIC_FOUNDRY_*),
 * 2. Claude through the Anthropic API (ANTHROPIC_API_KEY),
 * 3. any other image-reading model deployed in Azure AI Foundry (AZURE_AI_*),
 *    spoken to over the OpenAI-compatible chat completions API.
 * On Azure the model name is the deployment name.
 */
export type Provider =
  | { kind: "claude"; client: ClaudeClient; model: string }
  | { kind: "azure"; url: string; apiKey: string; model: string };

/** Accepts the endpoint as the Azure portal shows it, with or without the route. */
function chatCompletionsUrl(endpoint: string): string {
  const url = new URL(endpoint);
  let path = url.pathname.replace(/\/+$/, "");
  if (path === "") path = "/openai/v1";
  if (!path.endsWith("/chat/completions")) path += "/chat/completions";
  url.pathname = path;
  return url.href;
}

export function resolveProvider(): Provider {
  const model = process.env.EXTRACTION_MODEL;
  const foundryTarget = process.env.ANTHROPIC_FOUNDRY_RESOURCE || process.env.ANTHROPIC_FOUNDRY_BASE_URL;
  if (process.env.ANTHROPIC_FOUNDRY_API_KEY && foundryTarget) {
    return { kind: "claude", client: new AnthropicFoundry(), model: model || DEFAULT_MODEL };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { kind: "claude", client: new Anthropic(), model: model || DEFAULT_MODEL };
  }
  if (process.env.AZURE_AI_API_KEY && process.env.AZURE_AI_ENDPOINT) {
    if (!model) {
      throw new ExtractionError("not_configured", "EXTRACTION_MODEL must name the Azure deployment.");
    }
    let url: string;
    try {
      url = chatCompletionsUrl(process.env.AZURE_AI_ENDPOINT);
    } catch {
      throw new ExtractionError("not_configured", "AZURE_AI_ENDPOINT is not a valid URL.");
    }
    return { kind: "azure", url, apiKey: process.env.AZURE_AI_API_KEY, model };
  }
  throw new ExtractionError(
    "not_configured",
    "No model credentials: set ANTHROPIC_FOUNDRY_API_KEY and ANTHROPIC_FOUNDRY_RESOURCE, or ANTHROPIC_API_KEY, or AZURE_AI_API_KEY and AZURE_AI_ENDPOINT.",
  );
}

export function isExtractionConfigured(): boolean {
  try {
    resolveProvider();
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
  const provider = resolveProvider();
  return provider.kind === "claude"
    ? extractWithClaude(provider.client, provider.model, files)
    : extractWithAzure(provider, files);
}

async function extractWithClaude(
  client: ClaudeClient,
  model: string,
  files: SourceFile[],
): Promise<{ result: ExtractedDocument; model: string }> {

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

const TEXT_LAYER_NOTE =
  "Embedded text layer of the PDF pages above. Its ORDER is unreliable (see the rules), so take the layout and the order of code parts from the images. Its CHARACTERS are exact: use them to settle look-alike characters in codes, such as the letter O and the digit 0, I and 1, S and 5.";

/**
 * These models take images only, so each PDF page is sent as a picture of the page,
 * followed by the PDF's own text, which is exact about characters the picture leaves open.
 */
async function toImageParts(files: SourceFile[]) {
  const images: { mimeType: string; data: Buffer }[] = [];
  const texts: string[] = [];
  for (const file of files) {
    if (file.mimeType === "application/pdf") {
      for (const page of await renderPdfPages(file.data)) {
        images.push({ mimeType: "image/png", data: page.image });
        if (page.text) texts.push(page.text);
      }
    } else {
      images.push(file);
    }
  }
  const parts: ({ type: "image_url"; image_url: { url: string } } | { type: "text"; text: string })[] = images.map((image) => ({
    type: "image_url",
    image_url: { url: `data:${image.mimeType};base64,${image.data.toString("base64")}` },
  }));
  if (texts.length > 0) {
    parts.push({ type: "text", text: `${TEXT_LAYER_NOTE}\n\n${texts.join("\n\n").slice(0, 60000)}` });
  }
  return parts;
}

async function extractWithAzure(
  provider: Extract<Provider, { kind: "azure" }>,
  files: SourceFile[],
): Promise<{ result: ExtractedDocument; model: string }> {
  const images = await toImageParts(files);

  let response: Response;
  try {
    response = await fetch(provider.url, {
      method: "POST",
      headers: { "content-type": "application/json", "api-key": provider.apiKey },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 32000,
        response_format: {
          type: "json_schema",
          json_schema: { name: "extracted_document", strict: true, schema: z.toJSONSchema(ExtractedDocument) },
        },
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: [...images, { type: "text", text: EXTRACTION_USER_PROMPT }] },
        ],
      }),
    });
  } catch (error) {
    throw new ExtractionError("unavailable", error instanceof Error ? error.message : String(error));
  }

  if (!response.ok) {
    const detail = `${response.status} ${(await response.text()).slice(0, 500)}`;
    if (response.status === 401 || response.status === 403) throw new ExtractionError("auth", detail);
    if (response.status === 429) throw new ExtractionError("rate_limited", detail);
    if (response.status === 413) throw new ExtractionError("too_large", detail);
    throw new ExtractionError("unavailable", detail);
  }

  const body = (await response.json()) as {
    model?: string;
    choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
  };
  const choice = body.choices?.[0];
  if (choice?.finish_reason === "content_filter" || choice?.message?.refusal) {
    throw new ExtractionError("refused", "The model declined to read this document.");
  }
  if (choice?.finish_reason === "length") {
    throw new ExtractionError("truncated", "The document produced more output than fits in one response.");
  }

  // Some models wrap the JSON in a code fence even when asked for a schema.
  const text = choice?.message?.content ?? "";
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let parsed;
  try {
    parsed = ExtractedDocument.safeParse(JSON.parse(json));
  } catch {
    throw new ExtractionError("invalid_output", `The model's answer was not JSON: ${text.slice(0, 200)}`);
  }
  if (!parsed.success) {
    throw new ExtractionError("invalid_output", `The model's answer did not match the expected structure: ${parsed.error.message.slice(0, 500)}`);
  }
  return { result: parsed.data, model: body.model ?? provider.model };
}
