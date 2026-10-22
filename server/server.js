import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.cwd() !== projectRoot) process.chdir(projectRoot);

const [
  { app },
  { env },
  { ensureRuntimeSchema },
  { ensurePreventiviStorage },
] = await Promise.all([
  import("./app.js"),
  import("./config/env.js"),
  import("./db/ensureRuntimeSchema.js"),
  import("./config/ensurePreventiviStorage.js"),
]);

try {
  await ensureRuntimeSchema();
  await ensurePreventiviStorage();

  app.listen(env.port, () => {
    console.log(`Backend TEAM GROUP EdilAI avviato su http://localhost:${env.port}`);
  });
} catch (error) {
  console.error("Avvio backend TEAM GROUP EdilAI non riuscito:", error);
  process.exitCode = 1;
}
