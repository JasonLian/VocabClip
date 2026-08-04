import { chmod, cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const extensionId = "ifemhcegmfgmlebffkhlecbbibkglppb";
const hostName = "com.vocabclip.host";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const installDir = path.join(homedir(), "Library", "Application Support", "VocabClip", "native-host");
const manifestDir = path.join(homedir(), "Library", "Application Support", "Microsoft Edge", "NativeMessagingHosts");
const launcherPath = path.join(installDir, "vocabclip-host");
const manifestPath = path.join(manifestDir, `${hostName}.json`);

await mkdir(installDir, { recursive: true });
await mkdir(manifestDir, { recursive: true });
await cp(path.join(root, "native-host", "host.mjs"), path.join(installDir, "host.mjs"));
await cp(path.join(root, "native-host", "notebook.mjs"), path.join(installDir, "notebook.mjs"));
await writeFile(launcherPath, `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(path.join(installDir, "host.mjs"))}\n`, "utf8");
await chmod(launcherPath, 0o755);
await writeFile(manifestPath, `${JSON.stringify({
  name: hostName,
  description: "VocabClip local Obsidian bridge",
  path: launcherPath,
  type: "stdio",
  allowed_origins: [`chrome-extension://${extensionId}/`],
}, null, 2)}\n`, "utf8");

console.log(`Native host installed: ${manifestPath}`);
console.log(`Allowed extension ID: ${extensionId}`);

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}
