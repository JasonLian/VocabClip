import { escapeHtml, getSettings, sendMessage, setStatus, todayLocal } from "./shared.js";

const summary = document.querySelector("#summary");
const progressBar = document.querySelector("#progressBar");
const empty = document.querySelector("#empty");
const reviewCard = document.querySelector("#reviewCard");
const answer = document.querySelector("#answer");
const ratings = document.querySelector("#ratings");
const reveal = document.querySelector("#reveal");
const status = document.querySelector("#status");
let cards = [];
let index = 0;

document.querySelector("#openNotebook").addEventListener("click", async () => {
  try { await sendMessage("notebook.open"); } catch (error) { setStatus(status, error.message, "error"); }
});
reveal.addEventListener("click", () => {
  answer.hidden = false;
  ratings.hidden = false;
  reveal.hidden = true;
});
for (const button of ratings.querySelectorAll("button")) {
  button.addEventListener("click", () => rate(button.dataset.rating));
}

try {
  const result = await sendMessage("notebook.scan", { today: todayLocal() });
  cards = result.cards.filter((card) => card.due);
  render();
} catch (error) {
  summary.textContent = "无法读取单词本";
  setStatus(status, error.message, "error");
}

function render() {
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
  setStatus(status, "", "info");
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
    render();
  } catch (error) {
    setStatus(status, error.message, "error");
  } finally {
    for (const button of ratings.querySelectorAll("button")) button.disabled = false;
  }
}
