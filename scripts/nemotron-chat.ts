import { loadEnv } from "vite";
import { askNemotron } from "../server/nemotron-client";

const args = process.argv.slice(2);
const noThinking = args.includes("--no-thinking");
const prompt = args.filter((arg) => arg !== "--no-thinking").join(" ");
try {
  await askNemotron(prompt, !noThinking, undefined, {
    ...loadEnv("development", process.cwd(), ""),
    ...process.env,
  });
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Nemotron request failed",
  );
  process.exitCode = 1;
}
