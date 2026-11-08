import { afterEach, describe, expect, it, vi } from "vitest";
import {
  askNemotron,
  createNemotronCompletion,
  DEFAULT_NEMOTRON_BASE_URL,
} from "./nemotron-client";
import { toolDefinitions } from "./agent";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("official OpenAI SDK Nemotron transport", () => {
  it("sends function tools and the thinking toggle as top-level provider parameters", async () => {
    let sent: any;
    const fetcher = vi.fn(async (url: any, options: any) => {
      expect(String(url)).toBe(DEFAULT_NEMOTRON_BASE_URL + "/chat/completions");
      expect(new Headers(options.headers).get("authorization")).toBe(
        "Bearer EMPTY",
      );
      sent = JSON.parse(options.body);
      return Response.json({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              reasoning_content: "Provider reasoning",
              tool_calls: [
                {
                  id: "read",
                  type: "function",
                  function: { name: "get_financial_profile", arguments: "{}" },
                },
              ],
            },
          },
        ],
      });
    }) as unknown as typeof fetch;
    const message = await createNemotronCompletion({}, fetcher)(
      [{ role: "user", content: "What is my checking balance?" }],
      { tools: toolDefinitions, enableThinking: false },
    );
    expect(sent.model).toBe("nemotron");
    expect(sent.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(sent.extra_body).toBeUndefined();
    expect(sent.tools).toEqual(toolDefinitions);
    expect(sent.tool_choice).toBe("auto");
    expect(message.tool_calls?.[0].type).toBe("function");
    expect(message.reasoning_content).toBe("Provider reasoning");
  });

  it("prints reasoning before the final answer in the simple prompt helper", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: any, options: any) => {
        expect(
          JSON.parse(options.body).chat_template_kwargs.enable_thinking,
        ).toBe(true);
        return Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                role: "assistant",
                reasoning_content: "Provider reasoning",
                content: "Final answer",
              },
            },
          ],
        });
      }),
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await askNemotron("A sample prompt", true, undefined, {});
    expect(log.mock.calls).toEqual([
      ["Reasoning:\nProvider reasoning"],
      ["Response:\nFinal answer"],
    ]);
  });

  it("rejects truncated answers instead of applying a partial tool request", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        choices: [
          {
            finish_reason: "length",
            message: { role: "assistant", content: "Partial" },
          },
        ],
      }),
    ) as unknown as typeof fetch;
    await expect(
      createNemotronCompletion(
        {},
        fetcher,
      )([{ role: "user", content: "Hello" }]),
    ).rejects.toThrow(/token limit/);
  });
});
