import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_OUTPUT_BYTES = 256 * 1024;
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

type ChatConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxTokens: number;
  useApiKeyHeader: boolean;
  apiVersion?: string;
};

export type ChatFailure = { ok: false; status: number; error: string };
export type ChatResult = { ok: true; text: string; model: string } | ChatFailure;

function jsonFail(status: number, error: string): ChatFailure {
  return { ok: false, status, error };
}

function readChatConfig(): ChatConfig | ChatFailure {
  const apiKey = process.env.OPENAI_API_KEY?.trim() || process.env.LLM_API_KEY?.trim();
  if (!apiKey) {
    return jsonFail(503, "Chat Completions is not configured. Set OPENAI_API_KEY on the server.");
  }

  const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  if (!/^https:\/\//i.test(baseUrl)) {
    return jsonFail(500, "OPENAI_BASE_URL must be an https URL.");
  }

  const model = process.env.OPENAI_MODEL?.trim() || process.env.OPENAI_DEPLOYMENT?.trim() || DEFAULT_MODEL;
  if (!/^[A-Za-z0-9._:/-]+$/.test(model)) {
    return jsonFail(500, "OPENAI_MODEL is invalid.");
  }

  const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 120000);
  const maxTokens = Number(process.env.OPENAI_MAX_TOKENS || 4096);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300000) {
    return jsonFail(500, "OPENAI_TIMEOUT_MS is invalid.");
  }
  if (!Number.isFinite(maxTokens) || maxTokens < 16 || maxTokens > 128000) {
    return jsonFail(500, "OPENAI_MAX_TOKENS is invalid.");
  }

  return {
    apiKey,
    baseUrl,
    model,
    timeoutMs,
    maxTokens,
    useApiKeyHeader: process.env.OPENAI_AUTH_HEADER?.trim() === "api-key",
    apiVersion: process.env.OPENAI_API_VERSION?.trim() || undefined,
  };
}

function templateRoot(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function loadSolutionPromptTemplate(): { template: string } | ChatFailure {
  const fallback = path.join(templateRoot(), "prompts", "create-solution.txt");
  const override = process.env.SOLUTION_PROMPT_TEMPLATE?.trim();
  let filePath = fallback;
  if (override) {
    const resolved = path.resolve(process.cwd(), override);
    if (!isInside(path.resolve(process.cwd()), resolved) && resolved !== path.resolve(fallback)) {
      return jsonFail(500, "SOLUTION_PROMPT_TEMPLATE must stay inside the project directory.");
    }
    filePath = resolved;
  }
  if (!fs.existsSync(filePath)) {
    return jsonFail(500, "Solution prompt template file was not found.");
  }
  const template = fs.readFileSync(filePath, "utf8");
  if (!template.trim()) {
    return jsonFail(500, "Solution prompt template is empty.");
  }
  return { template };
}

export function applyPromptTemplate(template: string, input: string): string {
  return template.replaceAll("{{input}}", input).replaceAll("{{content}}", input);
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function stripFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:[\w.+-]+)?\r?\n([\s\S]*?)\r?\n```$/);
  return (match ? match[1] : trimmed).replace(/\u0000/g, "").trim();
}

export function loadSolutionsV2Prompt(name: string): { template: string } | ChatFailure {
  const filePath = path.join(templateRoot(), "prompts", "solutions-v2", name);
  if (!fs.existsSync(filePath)) {
    return jsonFail(500, `Solutions V2 prompt ${name} was not found.`);
  }
  const template = fs.readFileSync(filePath, "utf8");
  if (!template.trim()) {
    return jsonFail(500, `Solutions V2 prompt ${name} is empty.`);
  }
  return { template };
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
    template
  );
}

function completionsUrl(config: ChatConfig): string {
  const url = new URL(`${config.baseUrl}/chat/completions`);
  if (config.apiVersion) {
    url.searchParams.set("api-version", config.apiVersion);
  }
  return url.toString();
}

export async function completeChat(messages: ChatMessage[]): Promise<ChatResult> {
  const config = readChatConfig();
  if ("ok" in config) return config;
  if (!messages.length) return jsonFail(400, "Chat Completions requires at least one message.");

  try {
    const response = await fetch(completionsUrl(config), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.useApiKeyHeader
          ? { "api-key": config.apiKey }
          : { Authorization: `Bearer ${config.apiKey}` }),
      },
      body: JSON.stringify({
        model: config.model,
        temperature: Number(process.env.OPENAI_TEMPERATURE || 0.2),
        max_tokens: config.maxTokens,
        messages,
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });

    const text = await response.text();
    let json: {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    } = {};
    if (text) {
      try {
        json = JSON.parse(text) as typeof json;
      } catch {
        return jsonFail(502, "Chat Completions returned a non-JSON response.");
      }
    }

    if (!response.ok) {
      const message = json.error?.message || "Chat Completions request failed.";
      if (response.status === 401 || response.status === 403) {
        return jsonFail(502, "Chat Completions authentication failed. Check OPENAI_API_KEY.");
      }
      return jsonFail(502, message);
    }

    const content = json.choices?.[0]?.message?.content;
    const output =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.map((part) => part.text ?? "").join("")
          : "";
    const trimmed = output.replace(/\u0000/g, "").trim();
    if (!trimmed) {
      return jsonFail(502, "Chat Completions returned empty output.");
    }
    if (Buffer.byteLength(trimmed, "utf8") > MAX_OUTPUT_BYTES) {
      return jsonFail(502, "Chat Completions output exceeded the file size limit.");
    }
    return { ok: true, text: stripFence(trimmed), model: config.model };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return jsonFail(
      502,
      timedOut
        ? "Chat Completions timed out."
        : "Could not reach Chat Completions. Check OPENAI_BASE_URL and network connectivity."
    );
  }
}

export async function completeSolutionPrompt(prompt: string): Promise<ChatResult> {
  return completeChat([{ role: "user", content: prompt }]);
}
