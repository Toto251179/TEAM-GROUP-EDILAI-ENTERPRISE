import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const viteBin = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const serverEntry = path.join(projectRoot, "server", "server.js");
const frontendUrl = "http://127.0.0.1:5173";

if (!fs.existsSync(viteBin)) {
  console.error("Dipendenze mancanti. Eseguire prima: npm install");
  process.exit(1);
}

if (!fs.existsSync(serverEntry)) {
  console.error(`Backend non trovato: ${serverEntry}`);
  process.exit(1);
}

const children = new Set();
let shuttingDown = false;
let browserOpened = false;

function prefixStream(stream, prefix, target) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.trim()) target.write(`[${prefix}] ${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buffer.trim()) target.write(`[${prefix}] ${buffer}\n`);
  });
}

function spawnProcess(name, command, args) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: { ...process.env },
    shell: false,
    stdio: ["inherit", "pipe", "pipe"],
    windowsHide: false,
  });

  children.add(child);
  prefixStream(child.stdout, name, process.stdout);
  prefixStream(child.stderr, name, process.stderr);

  child.on("error", (error) => {
    console.error(`[${name}] impossibile avviare il processo:`, error.message);
  });

  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown && code !== 0) {
      console.error(`[${name}] terminato in modo anomalo (codice ${code ?? "-"}, segnale ${signal ?? "-"}).`);
    }
  });

  return child;
}

function openBrowser() {
  if (browserOpened) return;
  browserOpened = true;

  const platform = process.platform;
  let command;
  let args;

  if (platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", frontendUrl];
  } else if (platform === "darwin") {
    command = "open";
    args = [frontendUrl];
  } else {
    command = "xdg-open";
    args = [frontendUrl];
  }

  const opener = spawn(command, args, {
    cwd: projectRoot,
    detached: true,
    stdio: "ignore",
    shell: false,
  });
  opener.unref();
}

function shutdown(signal = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\nArresto gestionale in corso...");

  for (const child of children) {
    try {
      child.kill(signal);
    } catch {}
  }

  setTimeout(() => process.exit(0), 700).unref();
}

process.on("SIGINT", () => shutdown("SIGTERM"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (error) => {
  console.error("Errore non gestito nello script di avvio:", error);
  shutdown("SIGTERM");
});

console.log(`Cartella progetto: ${projectRoot}`);
console.log("Avvio backend sulla porta 3001...");
spawnProcess("backend", process.execPath, [serverEntry]);

console.log("Avvio frontend Vite sulla porta 5173...");
spawnProcess("frontend", process.execPath, [viteBin, "--host", "127.0.0.1", "--port", "5173", "--strictPort"]);

setTimeout(() => {
  console.log(`Apertura automatica gestionale: ${frontendUrl}`);
  openBrowser();
}, 2500);
