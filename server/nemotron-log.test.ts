import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createNemotronCompletion } from "./nemotron-client";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

it("persists complete responses before validation, including errors and malformed output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nemotron-log-"));
  directories.push(directory);
  const path = join(directory, "nested", "responses.jsonl");
  const bodies = [
    JSON.stringify({ choices: [{ finish_reason: "stop", message: {
      role: "assistant", content: "Answer", reasoning_content: "Reasoning",
      tool_calls: [{ id: "one", type: "function", function: { name: "select_action", arguments: "{}" } }],
    } }], usage: { total_tokens: 12 } }),
    JSON.stringify({ choices: [{ finish_reason: "length", message: { role: "assistant", content: "Partial" } }] }),
    '{"error":{"message":"Provider unavailable"}}',
    "not valid JSON",
  ];
  let index = 0;
  const complete = createNemotronCompletion({ NEMOTRON_LOG_PATH: path, NEMOTRON_API_KEY: "secret-test-key" }, async () => {
    const current = index++;
    return new Response(bodies[current], { status: current === 2 ? 503 : 200,
      headers: { "Content-Type": "application/json", "x-request-id": `provider-${current}` } });
  });
  const messages = [{ role: "user" as const, content: "Can I move to China?" }];
  await expect(complete(messages)).resolves.toMatchObject({ content: "Answer" });
  await expect(complete(messages)).rejects.toThrow(/token limit/);
  await expect(complete(messages)).rejects.toThrow(/HTTP 503/);
  await expect(complete(messages)).rejects.toThrow();
  const saved = await readFile(path, "utf8");
  const records = saved.trim().split("\n").map(line => JSON.parse(line));
  expect(records.map(record => record.responseBody)).toEqual(bodies);
  expect(records.map(record => record.status)).toEqual([200, 200, 503, 200]);
  expect(new Set(records.map(record => record.id)).size).toBe(4);
  expect(JSON.parse(records[0].requestBody).messages).toEqual(messages);
  expect(records[0].providerRequestId).toBe("provider-0");
  expect(saved).not.toContain("secret-test-key");
});

it("reports a log write failure instead of returning an unsaved response", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nemotron-log-"));
  directories.push(directory);
  const complete = createNemotronCompletion({ NEMOTRON_LOG_PATH: directory }, async () => Response.json({ choices: [] }));
  await expect(complete([{ role: "user", content: "Hello" }])).rejects.toThrow(/Could not save the Nemotron response/);
});
