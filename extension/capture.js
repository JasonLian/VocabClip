import { sendMessage, setStatus, todayLocal } from "./shared.js";

const fieldNames = ["term", "ipa", "partOfSpeech", "meaning", "forms", "memoryAid", "originalContext", "example", "sourceTitle", "sourceUrl"];
const fields = Object.fromEntries(fieldNames.map((name) => [name, document.querySelector(`#${name}`)]));
const status = document.querySelector("#status");
const saveButton = document.querySelector("#save");
const regenerateButton = document.querySelector("#regenerate");
const subtitle = document.querySelector("#subtitle");
const captureId = new URLSearchParams(location.search).get("id");
let capture;

try {
  capture = await sendMessage("capture.get", { id: captureId });
  fields.term.value = capture.selectionText || "";
  fields.originalContext.value = capture.nearbyText || capture.selectionText || "";
  fields.sourceTitle.value = capture.sourceTitle || "";
  fields.sourceUrl.value = capture.sourceUrl || "";
  await generate();
} catch (error) {
  subtitle.textContent = "可以手工补充后保存";
  setStatus(status, error.message, "error");
}

regenerateButton.addEventListener("click", generate);
saveButton.addEventListener("click", async () => {
  try {
    const card = Object.fromEntries(fieldNames.map((name) => [name, fields[name].value.trim()]));
    if (!card.term) throw new Error("单词或短语不能为空");
    saveButton.disabled = true;
    const result = await sendMessage("card.add", { card, today: todayLocal(), onDuplicate: "appendContext" });
    subtitle.textContent = result.duplicate ? "已更新已有单词" : "已加入待学习";
    setStatus(status, result.duplicate ? "检测到重复词条，已追加新的语境和来源" : "已安全写入 Obsidian 单词本", "success");
  } catch (error) {
    saveButton.disabled = false;
    setStatus(status, error.message, "error");
  }
});

async function generate() {
  if (!capture) return;
  regenerateButton.disabled = true;
  saveButton.disabled = true;
  subtitle.textContent = "正在用 DeepSeek 整理内容";
  setStatus(status, "", "info");
  try {
    const card = await sendMessage("deepseek.generate", capture);
    for (const name of fieldNames) {
      if (card[name] !== undefined) fields[name].value = card[name] || "";
    }
    subtitle.textContent = "请检查并编辑后确认写入";
  } catch (error) {
    subtitle.textContent = "AI 处理失败，可手工补充后保存";
    setStatus(status, error.message, "error");
  } finally {
    regenerateButton.disabled = false;
    saveButton.disabled = false;
  }
}
