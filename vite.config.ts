import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { scenarioApi } from "./server/nemotron";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), scenarioApi(env)],
    server: { port: 5173, strictPort: true },
    preview: { port: 5173 },
  };
});
