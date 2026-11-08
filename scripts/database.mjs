import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
const local = path.resolve(
  ".spacetime/bin",
  process.platform === "win32" ? "spacetimedb-cli.exe" : "spacetime",
);
const cli = existsSync(local) ? local : "spacetime";
const commands = {
  start: [
    "start",
    "--listen-addr",
    "127.0.0.1:3000",
    "--data-dir",
    ".spacetime/data",
    "--non-interactive",
  ],
  publish: [
    "publish",
    "--server",
    "http://127.0.0.1:3000",
    "--module-path",
    "spacetimedb",
    "--anonymous",
    "--yes=skip-login",
    "ping-local",
  ],
  generate: [
    "generate",
    "--lang",
    "typescript",
    "--out-dir",
    "src/module_bindings",
    "--module-path",
    "spacetimedb",
    "-y",
  ],
};
const args = commands[process.argv[2]];
if (!args) throw new Error("Use start, publish, or generate");
const child = spawn(cli, args, { stdio: "inherit", windowsHide: true });
child.on("error", () => {
  console.error(
    "SpacetimeDB CLI not found. Install it from https://spacetimedb.com/install or run the device-persistent demo with VITE_SPACETIMEDB_DATABASE unset.",
  );
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 1));
