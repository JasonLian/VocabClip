import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, "extension");
const destination = path.join(root, "dist", "extension");

await rm(path.join(root, "dist"), { recursive: true, force: true });
await mkdir(path.dirname(destination), { recursive: true });
await cp(source, destination, { recursive: true });
JSON.parse(await readFile(path.join(destination, "manifest.json"), "utf8"));
console.log(`VocabClip build ready: ${destination}`);
