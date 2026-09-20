import { describe, expect, test } from "bun:test";
import { createAnthropicAdapter } from "../../../src/adapters/anthropic";
import { createGoogleAdapter } from "../../../src/adapters/google";
import { createOpenAIChatAdapter } from "../../../src/adapters/openai-chat";
import { anthropicToResponsesBody } from "../../../src/claude/inbound";
import { parseRequest } from "../../../src/responses/parser";
import type { OcxParsedRequest, OcxProviderConfig } from "../../../src/types";

/**
 * #5210. `strict` and `allowed_callers` are declaration fields Anthropic defines, and the
 * Messages-to-Messages route rebuilt every tool from name, description and input_schema alone.
 * The request succeeded, so a caller had no way to learn that the schema was no longer enforced
 * or that the tool had been offered to a caller it was fenced off from. Each case below reads
 * the request the adapter actually sends.
 */

const anthropicProvider = {
  adapter: "anthropic",
  baseUrl: "https://api.anthropic.com",
  apiKey: "sk-x",
  authMode: "apiKey",
} as unknown as OcxProviderConfig;

function claudeTool(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    name: "tool_a",
    description: "Controlled tool.",
    input_schema: { type: "object", properties: {} },
    ...extra,
  };
}

function parsedFromClaude(tool: Record<string, unknown>): OcxParsedRequest {
  return parseRequest(anthropicToResponsesBody({
    model: "anthropic/claude-sonnet-4.5",
    max_tokens: 64,
    messages: [{ role: "user", content: "Call the tool." }],
    tools: [tool],
  }));
}

async function anthropicTools(tool: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
  const { body } = await createAnthropicAdapter(anthropicProvider).buildRequest(parsedFromClaude(tool));
  return (JSON.parse(typeof body === "string" ? body : JSON.stringify(body)) as {
    tools: Array<Record<string, unknown>>;
  }).tools;
}

describe("anthropic tool declarations carry their caller-supplied constraints", () => {
  test("an explicit strict:true survives the round trip", async () => {
    const [tool] = await anthropicTools(claudeTool({ strict: true }));
    expect(tool.strict).toBe(true);
    expect(tool.name).toBe("tool_a");
    expect(tool.input_schema).toEqual({ type: "object", properties: {} });
  });

  test("an unstated strict stays absent rather than becoming an opt-out", async () => {
    const [tool] = await anthropicTools(claudeTool({}));
    expect(tool).not.toHaveProperty("strict");
    const [explicitFalse] = await anthropicTools(claudeTool({ strict: false }));
    expect(explicitFalse).not.toHaveProperty("strict");
  });

  test("allowed_callers reaches the upstream instead of being rebuilt away", async () => {
    const [tool] = await anthropicTools(claudeTool({ allowed_callers: ["code_execution_20260120"] }));
    expect(tool.allowed_callers).toEqual(["code_execution_20260120"]);
  });

  test("a tool without allowed_callers gains no key", async () => {
    const [tool] = await anthropicTools(claudeTool({}));
    expect(tool).not.toHaveProperty("allowed_callers");
  });
});

describe("wires without an allowed_callers counterpart refuse rather than widen", () => {
  const restricted = claudeTool({ allowed_callers: ["code_execution_20260120"] });
  const unrestricted = claudeTool({ allowed_callers: ["direct"] });

  test("the OpenAI Chat wire refuses a caller-restricted declaration", () => {
    const adapter = createOpenAIChatAdapter({
      adapter: "openai-chat",
      baseUrl: "https://gateway.example.internal/v1",
      apiKey: "k",
    });
    expect(() => adapter.buildRequest(parsedFromClaude(restricted)))
      .toThrow(/cannot express tools\[\]\.allowed_callers/);
  });

  test("the Gemini wire refuses a caller-restricted declaration", async () => {
    const adapter = createGoogleAdapter({
      adapter: "google",
      baseUrl: "https://generativelanguage.googleapis.com",
      apiKey: "key",
    } as unknown as OcxProviderConfig);
    await expect(adapter.buildRequest(parsedFromClaude(restricted)))
      .rejects.toThrow(/cannot express tools\[\]\.allowed_callers/);
  });

  test('the unrestricted ["direct"] default is not treated as a restriction', () => {
    const adapter = createOpenAIChatAdapter({
      adapter: "openai-chat",
      baseUrl: "https://gateway.example.internal/v1",
      apiKey: "k",
    });
    const built = JSON.parse(adapter.buildRequest(parsedFromClaude(unrestricted)).body) as {
      tools: Array<{ function: { name: string } }>;
    };
    expect(built.tools.map(tool => tool.function.name)).toEqual(["tool_a"]);
  });
});
