export const HOST_NAME = "com.vocabclip.host";

export const DEFAULT_SETTINGS = Object.freeze({
  notebookPath: "",
  apiKey: "",
  model: "deepseek-v4-flash",
  reviewWeekdays: [0, 1, 2, 3, 4, 5, 6],
  reminderTime: "20:00",
});

export const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export async function getSettings() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function sendMessage(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.ok) {
    throw new Error(response?.error || "操作失败");
  }
  return response.data;
}

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function setStatus(element, message, kind = "info") {
  element.textContent = message;
  element.className = `status ${kind}`;
  element.hidden = !message;
}

export function todayLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
