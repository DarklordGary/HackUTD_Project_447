import OpenAI from "openai";
import type {
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";

export const DEFAULT_NEMOTRON_BASE_URL = "https://5000-19yyxh1ah.gobrev.dev/v1";
export type NemotronMessage = ChatCompletionMessage & {
  reasoning_content?: string | null;
};

export function nemotronConfig(env: Record<string, string | undefined>) {
  return {
    baseURL: (env.NEMOTRON_BASE_URL || DEFAULT_NEMOTRON_BASE_URL).replace(
      /\/+$/,
      "",
    ),
    apiKey: env.NEMOTRON_API_KEY || "EMPTY",
    model: env.NEMOTRON_MODEL || "nemotron",
    enableThinking: env.NEMOTRON_ENABLE_THINKING === "true",
  };
}

export function createNemotronCompletion(
  env: Record<string, string | undefined>,
  fetcher: typeof fetch = fetch,
) {
  const config = nemotronConfig(env);
  const client = new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    timeout: 90000,
    maxRetries: 0,
    fetch: fetcher,
  });
  return async (
    messages: ChatCompletionMessageParam[],
    options: {
      enableThinking?: boolean;
      tools?: ChatCompletionTool[];
      signal?: AbortSignal;
      maxTokens?: number;
      toolChoice?: "auto" | "required";
    } = {},
  ): Promise<NemotronMessage> => {
    // Python's extra_body equivalent: custom provider fields go directly in the Node request body.
    const body: ChatCompletionCreateParamsNonStreaming & {
      chat_template_kwargs: { enable_thinking: boolean };
    } = {
      model: config.model,
      messages,
      temperature: 0.1,
      max_tokens: options.maxTokens ?? 4096,
      stream: false,
      chat_template_kwargs: {
        enable_thinking: options.enableThinking ?? config.enableThinking,
      },
      ...(options.tools?.length
        ? { tools: options.tools, tool_choice: options.toolChoice ?? "auto" }
        : {}),
    };
    try {
      const response = await client.chat.completions.create(body, {
        signal: options.signal,
      });
      const message = response.choices?.[0]?.message as
        NemotronMessage | undefined;
      if (!message || message.role !== "assistant")
        throw new Error("Nemotron returned an invalid assistant message.");
      if (response.choices[0].finish_reason === "length")
        throw new Error(
          "Nemotron reached the response token limit. Disable thinking or narrow your request and retry.",
        );
      return message;
    } catch (error) {
      if (
        error instanceof OpenAI.APIConnectionTimeoutError ||
        options.signal?.aborted
      )
        throw new Error(
          "Nemotron timed out before completing this request. No changes were applied; retry or disable thinking.",
        );
      if (error instanceof OpenAI.APIConnectionError)
        throw new Error(
          "Cannot reach the Nemotron deployment. Check NEMOTRON_BASE_URL and that the Brev server is running.",
        );
      if (error instanceof OpenAI.APIError) {
        if (error.status === 401 || error.status === 403)
          throw new Error(
            `Nemotron authorization failed (HTTP ${error.status}). Check the deployment API key and access.`,
          );
        if (error.status === 410)
          throw new Error(
            "The configured Nemotron deployment is no longer available (HTTP 410). Update NEMOTRON_BASE_URL or NEMOTRON_MODEL.",
          );
        throw new Error(
          `Nemotron returned HTTP ${error.status ?? "unknown"}. Check that the Brev deployment is running and supports chat completions and tool calling.`,
        );
      }
      throw error;
    }
  };
}

/** Small Node example: print the provider's reasoning first, then its final answer. */
export async function askNemotron(
  prompt: string,
  enableThinking = true,
  tools?: ChatCompletionTool[],
  env: Record<string, string | undefined> = process.env,
) {
  if (!prompt.trim()) throw new Error("A user prompt is required.");
  const message = await createNemotronCompletion(env)(
    [{ role: "user", content: prompt }],
    { enableThinking, tools },
  );
  if (message.reasoning_content)
    console.log("Reasoning:\n" + message.reasoning_content);
  if (message.content) console.log("Response:\n" + message.content);
  if (message.tool_calls?.length)
    console.log("Tool calls:\n" + JSON.stringify(message.tool_calls, null, 2));
  return message;
}
