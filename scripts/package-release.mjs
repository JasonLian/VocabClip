import { execFile } from "node:child_process";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const releaseRoot = path.join(root, "release");
const folderName = `VocabClip-v${packageJson.version}-macos`;
const staging = path.join(releaseRoot, folderName);
const archive = path.join(releaseRoot, `${folderName}.zip`);

await rm(staging, { recursive: true, force: true });
await rm(archive, { force: true });
await mkdir(staging, { recursive: true });

for (const entry of [
  ".gitignore",
  "README.md",
  "package.json",
  ".github",
  "extension",
  "native-host",
  "scripts",
  "tests",
  "dist",
]) {
  await cp(path.join(root, entry), path.join(staging, entry), { recursive: true });
}

await run("/usr/bin/zip", ["-r", "-X", archive, folderName], { cwd: releaseRoot });
await rm(staging, { recursive: true, force: true });
console.log(`Release package ready: ${archive}`);
