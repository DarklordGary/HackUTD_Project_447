import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
export class NemotronLogError extends Error {}

/** Save the wire response before the SDK parses or validates it. Never store headers/API keys. */
export function loggedNemotronFetch(
  fetcher: typeof fetch,
  env: Record<string, string | undefined>,
): typeof fetch {
  const path = resolve(env.NEMOTRON_LOG_PATH || "logs/nemotron.jsonl");
  // Serialize appends for concurrent requests handled by this client.
  let pending = Promise.resolve();
  return async (input, init) => {
    const startedAt = new Date().toISOString();
    const response = await fetcher(input, init);
    const responseBody = await response.clone().text();
    const record = {
      id: randomUUID(),
      startedAt,
      receivedAt: new Date().toISOString(),
      requestBody: typeof init?.body === "string" ? init.body : null,
      status: response.status,
      providerRequestId: response.headers.get("x-request-id"),
      responseBody,
    };
    pending = pending.then(async () => {
      await mkdir(dirname(path), { recursive: true });
      await appendFile(path, JSON.stringify(record) + "\n", "utf8");
    });
    try {
      await pending;
    } catch {
      throw new NemotronLogError(`Could not save the Nemotron response to ${path}. Check disk space and permissions before retrying.`);
    }
    return response;
  };
}
