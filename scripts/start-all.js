import { spawn } from "node:child_process";

const commands = [
  { name: "backend", command: "node", args: ["server/server.js"] },
  { name: "frontend", command: "node", args: ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5173"] },
];

for (const item of commands) {
  const child = spawn(item.command, item.args, {
    cwd: process.cwd(),
    shell: false,
    stdio: "pipe",
  });

  child.stdout.on("data", (data) => process.stdout.write(`[${item.name}] ${data}`));
  child.stderr.on("data", (data) => process.stderr.write(`[${item.name}] ${data}`));
  child.on("exit", (code) => {
    if (code !== 0) process.stderr.write(`[${item.name}] terminato con codice ${code}\n`);
  });
}
