import { rm } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";

const appDir = path.join(homedir(), "Library", "Application Support", "VocabClip");
const manifestPath = path.join(homedir(), "Library", "Application Support", "Microsoft Edge", "NativeMessagingHosts", "com.vocabclip.host.json");

await rm(manifestPath, { force: true });
await rm(appDir, { recursive: true, force: true });
console.log("VocabClip native host removed");
