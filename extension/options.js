import { DEFAULT_SETTINGS, WEEKDAY_LABELS, getSettings, sendMessage, setStatus } from "./shared.js";

const pathInput = document.querySelector("#notebookPath");
const apiKeyInput = document.querySelector("#apiKey");
const modelInput = document.querySelector("#model");
const reminderInput = document.querySelector("#reminderTime");
const weekdaysContainer = document.querySelector("#weekdays");
const status = document.querySelector("#status");

for (let day = 0; day < 7; day += 1) {
  const label = document.createElement("label");
  label.className = "weekday";
  label.innerHTML = `<input type="checkbox" value="${day}">${WEEKDAY_LABELS[day]}`;
  weekdaysContainer.append(label);
}

const settings = await getSettings();
pathInput.value = settings.notebookPath;
apiKeyInput.value = settings.apiKey;
modelInput.value = settings.model;
reminderInput.value = settings.reminderTime;
for (const checkbox of weekdaysContainer.querySelectorAll("input")) {
  checkbox.checked = settings.reviewWeekdays.includes(Number(checkbox.value));
}

document.querySelector("#save").addEventListener("click", async () => {
  try {
    const reviewWeekdays = selectedWeekdays();
    const notebookPath = pathInput.value.trim();
    if (!notebookPath.startsWith("/") || !notebookPath.toLowerCase().endsWith(".md")) {
      throw new Error("请输入已存在 Markdown 文件的绝对路径");
    }
    if (!reviewWeekdays.length) throw new Error("至少选择一个学习日");
    await chrome.storage.local.set({
      notebookPath,
      apiKey: apiKeyInput.value.trim(),
      model: modelInput.value || DEFAULT_SETTINGS.model,
      reminderTime: reminderInput.value || DEFAULT_SETTINGS.reminderTime,
      reviewWeekdays,
    });
    await sendMessage("settings.changed");
    setStatus(status, "设置已保存", "success");
  } catch (error) {
    setStatus(status, error.message, "error");
  }
});

document.querySelector("#testNotebook").addEventListener("click", async () => {
  try {
    const result = await sendMessage("native.health", { notebookPath: pathInput.value.trim() });
    setStatus(status, `文件连接正常，识别到 ${result.cardCount} 个单词`, "success");
  } catch (error) {
    setStatus(status, error.message, "error");
  }
});

document.querySelector("#testDeepSeek").addEventListener("click", async () => {
  try {
    await sendMessage("deepseek.test", { apiKey: apiKeyInput.value.trim(), model: modelInput.value });
    setStatus(status, "DeepSeek API 连接正常", "success");
  } catch (error) {
    setStatus(status, error.message, "error");
  }
});

function selectedWeekdays() {
  return [...weekdaysContainer.querySelectorAll("input:checked")].map((input) => Number(input.value));
}
