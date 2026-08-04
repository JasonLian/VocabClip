import { spawn } from "node:child_process";
import { homedir, endianness } from "node:os";
import path from "node:path";
import {
  addCardToNotebookFile,
  recordReviewInNotebookFile,
  scanNotebookFile,
  validateNotebookPath,
} from "./notebook.mjs";

const backupDir = path.join(homedir(), "Library", "Application Support", "VocabClip", "backups");
const lengthReader = endianness() === "LE" ? "readUInt32LE" : "readUInt32BE";
const lengthWriter = endianness() === "LE" ? "writeUInt32LE" : "writeUInt32BE";
let buffer = Buffer.alloc(0);

process.stdin.on("data", async (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const length = buffer[lengthReader](0);
    if (length > 4 * 1024 * 1024) {
      writeResponse({ ok: false, error: "请求过大" });
      process.exit(1);
    }
    if (buffer.length < length + 4) return;
    const payload = buffer.subarray(4, length + 4);
    buffer = buffer.subarray(length + 4);
    await respond(payload);
  }
});

process.stdin.on("error", (error) => console.error(error));

async function respond(payload) {
  let request;
  try {
    request = JSON.parse(payload.toString("utf8"));
    const data = await handle(request.action, request.payload || {});
    writeResponse({ id: request.id, ok: true, data });
  } catch (error) {
    console.error(error?.stack || error);
    writeResponse({ id: request?.id, ok: false, error: error?.message || String(error) });
  }
}

async function handle(action, payload) {
  switch (action) {
    case "health.check": {
      const result = await scanNotebookFile(payload.notebookPath, payload.today);
      return { connected: true, cardCount: result.cards.length };
    }
    case "notebook.scan":
      return scanNotebookFile(payload.notebookPath, payload.today);
    case "card.add":
      return addCardToNotebookFile(payload.notebookPath, payload.card, payload, backupDir);
    case "review.record":
      return recordReviewInNotebookFile(payload.notebookPath, payload, backupDir);
    case "notebook.open": {
      const notebookPath = await validateNotebookPath(payload.notebookPath);
      const child = spawn("open", ["-a", "Obsidian", notebookPath], { detached: true, stdio: "ignore" });
      child.unref();
      return { opened: true };
    }
    default:
      throw new Error("未知的本地操作");
  }
}

function writeResponse(response) {
  const body = Buffer.from(JSON.stringify(response), "utf8");
  if (body.length > 1024 * 1024) throw new Error("响应超过 1 MB");
  const header = Buffer.alloc(4);
  header[lengthWriter](body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}
