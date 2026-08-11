import { escapeHtml, getSettings, sendMessage, setStatus, todayLocal } from "./shared.js";

const dueCount = document.querySelector("#dueCount");
const dueLabel = document.querySelector("#dueLabel");
const dashboardStatus = document.querySelector("#dashboardStatus");
const reviewButton = document.querySelector("#reviewButton");
const dashboardView = document.querySelector("#dashboardView");
const reviewView = document.querySelector("#reviewView");
const summary = document.querySelector("#summary");
const progressBar = document.querySelector("#progressBar");
const empty = document.querySelector("#empty");
const reviewCard = document.querySelector("#reviewCard");
const answer = document.querySelector("#answer");
const ratings = document.querySelector("#ratings");
const reveal = document.querySelector("#reveal");
const reviewStatus = document.querySelector("#reviewStatus");
let cards = [];
let index = 0;

document.querySelector("#settingsButton").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.querySelector("#openButton").addEventListener("click", async () => {
  try { await sendMessage("notebook.open"); } catch (error) { setStatus(dashboardStatus, error.message, "error"); }
});
document.querySelector("#reviewOpenNotebook").addEventListener("click", openNotebookFromReview);
reviewButton.addEventListener("click", startReview);
document.querySelector("#backButton").addEventListener("click", showDashboard);
document.querySelector("#returnButton").addEventListener("click", showDashboard);
reveal.addEventListener("click", () => {
  answer.hidden = false;
  ratings.hidden = false;
  reveal.hidden = true;
});
for (const button of ratings.querySelectorAll("button")) {
  button.addEventListener("click", () => rate(button.dataset.rating));
}

await refreshDashboard();

async function refreshDashboard() {
  try {
    const result = await sendMessage("notebook.scan", { today: todayLocal() });
    const count = result.cards.filter((card) => card.due).length;
    dueCount.textContent = String(count);
    dueLabel.textContent = count ? "个单词今天需要复习" : "今天没有到期单词";
    reviewButton.disabled = count === 0;
    setStatus(dashboardStatus, "", "info");
  } catch (error) {
    dueCount.textContent = "!";
    dueLabel.textContent = "尚未连接单词本";
    reviewButton.disabled = true;
    setStatus(dashboardStatus, error.message, "error");
  }
}

async function startReview() {
  reviewButton.disabled = true;
  try {
    const result = await sendMessage("notebook.scan", { today: todayLocal() });
    cards = result.cards.filter((card) => card.due);
    index = 0;
    dashboardView.hidden = true;
    reviewView.hidden = false;
    renderReview();
  } catch (error) {
    setStatus(dashboardStatus, error.message, "error");
  } finally {
    reviewButton.disabled = false;
  }
}

async function showDashboard() {
  reviewView.hidden = true;
  dashboardView.hidden = false;
  await refreshDashboard();
}

function renderReview() {
  const total = cards.length;
  summary.textContent = total ? `第 ${Math.min(index + 1, total)} 个，共 ${total} 个` : "今日任务已完成";
  progressBar.style.width = total ? `${(index / total) * 100}%` : "100%";
  if (index >= total) {
    empty.hidden = false;
    reviewCard.hidden = true;
    return;
  }

  const card = cards[index];
  empty.hidden = true;
  reviewCard.hidden = false;
  document.querySelector("#term").textContent = card.term;
  document.querySelector("#ipa").textContent = card.ipa || "";
  document.querySelector("#sourceContext").textContent = card.originalContext || "先回忆它的含义和使用方式";
  answer.innerHTML = `<dl>
    <dt>词性</dt><dd>${escapeHtml(card.partOfSpeech || "—")}</dd>
    <dt>释义</dt><dd>${escapeHtml(card.meaning || "—")}</dd>
    <dt>词形</dt><dd>${escapeHtml(card.forms || "—")}</dd>
    <dt>辅助记忆</dt><dd>${escapeHtml(card.memoryAid || "—")}</dd>
    <dt>例句</dt><dd>${escapeHtml(card.example || "—")}</dd>
  </dl>`;
  answer.hidden = true;
  ratings.hidden = true;
  reveal.hidden = false;
  setStatus(reviewStatus, "", "info");
}

async function rate(rating) {
  const card = cards[index];
  for (const button of ratings.querySelectorAll("button")) button.disabled = true;
  try {
    const settings = await getSettings();
    await sendMessage("review.record", {
      id: card.id,
      term: card.term,
      rating,
      today: todayLocal(),
      reviewWeekdays: settings.reviewWeekdays,
    });
    index += 1;
    renderReview();
  } catch (error) {
    setStatus(reviewStatus, error.message, "error");
  } finally {
    for (const button of ratings.querySelectorAll("button")) button.disabled = false;
  }
}

async function openNotebookFromReview() {
  try {
    await sendMessage("notebook.open");
  } catch (error) {
    setStatus(reviewStatus, error.message, "error");
  }
}
