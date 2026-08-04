import { sendMessage, setStatus, todayLocal } from "./shared.js";

const dueCount = document.querySelector("#dueCount");
const dueLabel = document.querySelector("#dueLabel");
const status = document.querySelector("#status");
const reviewButton = document.querySelector("#reviewButton");

document.querySelector("#settingsButton").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.querySelector("#openButton").addEventListener("click", async () => {
  try { await sendMessage("notebook.open"); } catch (error) { setStatus(status, error.message, "error"); }
});
reviewButton.addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("review.html") }));

try {
  const result = await sendMessage("notebook.scan", { today: todayLocal() });
  const count = result.cards.filter((card) => card.due).length;
  dueCount.textContent = String(count);
  dueLabel.textContent = count ? "个单词今天需要复习" : "今天没有到期单词";
  reviewButton.disabled = count === 0;
} catch (error) {
  dueCount.textContent = "!";
  dueLabel.textContent = "尚未连接单词本";
  reviewButton.disabled = true;
  setStatus(status, error.message, "error");
}
