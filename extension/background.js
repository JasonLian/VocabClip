import { DEFAULT_SETTINGS, HOST_NAME, getSettings, todayLocal } from "./shared.js";

const MENU_ID = "vocabclip-add-selection";
const ALARM_ID = "vocabclip-daily-review";

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "加入 VocabClip：%s",
      contexts: ["selection"],
    });
  });
  await scheduleNextReminder();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaults();
  await scheduleNextReminder();
  await maybeNotifyDueCards(true);
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText?.trim()) return;

  let nearbyText = "";
  if (tab?.id) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const selection = window.getSelection();
          const node = selection?.anchorNode;
          const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
          return (element?.closest("p,li,blockquote,article,section")?.innerText || "").trim().slice(0, 1200);
        },
      });
      nearbyText = result || "";
    } catch {
      // Restricted browser pages still support selectionText from the menu event.
    }
  }

  const id = crypto.randomUUID();
  await chrome.storage.session.set({
    [`capture:${id}`]: {
      selectionText: info.selectionText.trim().slice(0, 300),
      nearbyText,
      sourceTitle: tab?.title || "",
      sourceUrl: info.pageUrl || tab?.url || "",
      createdAt: Date.now(),
    },
  });
  await chrome.tabs.create({ url: chrome.runtime.getURL(`capture.html?id=${encodeURIComponent(id)}`) });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_ID) return;
  await maybeNotifyDueCards(false);
  await scheduleNextReminder();
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId !== "vocabclip-review") return;
  await chrome.tabs.create({ url: chrome.runtime.getURL("review.html") });
  chrome.notifications.clear(notificationId);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});

async function handleMessage(message) {
  switch (message?.type) {
    case "native.health":
      return callNative("health.check", message.payload);
    case "notebook.scan":
      return callNative("notebook.scan", await withNotebookPath(message.payload));
    case "card.add":
      return callNative("card.add", await withNotebookPath(message.payload));
    case "review.record":
      return callNative("review.record", await withNotebookPath(message.payload));
    case "notebook.open":
      return callNative("notebook.open", await withNotebookPath(message.payload));
    case "deepseek.generate":
      return generateCard(message.payload);
    case "deepseek.test":
      return testDeepSeek(message.payload);
    case "settings.changed":
      await scheduleNextReminder();
      return { scheduled: true };
    case "capture.get":
      return getPendingCapture(message.payload.id);
    default:
      throw new Error("未知操作");
  }
}

async function ensureDefaults() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const missing = {};
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (stored[key] === undefined) missing[key] = value;
  }
  if (Object.keys(missing).length) await chrome.storage.local.set(missing);
}

async function withNotebookPath(payload = {}) {
  const { notebookPath } = await getSettings();
  if (!notebookPath) throw new Error("请先配置单词本路径");
  return { ...payload, notebookPath };
}

function callNative(action, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(HOST_NAME, { id: crypto.randomUUID(), action, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(`本地桥接程序不可用：${chrome.runtime.lastError.message}`));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "本地操作失败"));
        return;
      }
      resolve(response.data);
    });
  });
}

async function getPendingCapture(id) {
  if (!id) throw new Error("缺少剪藏编号");
  const key = `capture:${id}`;
  const result = await chrome.storage.session.get(key);
  const capture = result[key];
  if (!capture) throw new Error("剪藏内容已过期，请重新划词");
  return capture;
}

async function generateCard(capture) {
  const settings = await getSettings();
  if (!settings.apiKey) throw new Error("请先在设置中填写 DeepSeek API Key");

  const prompt = [
    "请把用户选中的英语内容整理成英语学习卡片，并仅返回 JSON 对象。",
    "字段必须是 term, ipa, partOfSpeech, meaning, forms, memoryAid, originalContext, example。",
    "term 保留自然大小写；meaning 使用简洁中文；example 使用自然英语；没有可靠内容的字段返回空字符串。",
    `选中内容：${capture.selectionText || ""}`,
    `附近语境：${capture.nearbyText || ""}`,
    `网页标题：${capture.sourceTitle || ""}`,
  ].join("\n");

  const body = {
    model: settings.model || DEFAULT_SETTINGS.model,
    messages: [
      { role: "system", content: "You create concise English vocabulary cards. Return valid JSON only." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    thinking: { type: "disabled" },
    max_tokens: 900,
    stream: false,
  };

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`DeepSeek 请求失败（${response.status}）：${detail.slice(0, 160)}`);
      }
      const result = await response.json();
      const content = result?.choices?.[0]?.message?.content;
      if (!content) throw new Error("DeepSeek 返回了空内容");
      const parsed = parseJsonContent(content);
      return {
        ...parsed,
        term: parsed.term || capture.selectionText || "",
        originalContext: parsed.originalContext || capture.nearbyText || capture.selectionText || "",
        sourceTitle: capture.sourceTitle || "",
        sourceUrl: capture.sourceUrl || "",
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("DeepSeek 处理失败");
}

async function testDeepSeek(payload = {}) {
  const settings = await getSettings();
  const apiKey = payload.apiKey || settings.apiKey;
  const model = payload.model || settings.model;
  if (!apiKey) throw new Error("请填写 API Key");
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      thinking: { type: "disabled" },
      max_tokens: 10,
      stream: false,
    }),
  });
  if (!response.ok) throw new Error(`API 测试失败（${response.status}）`);
  return { connected: true };
}

function parseJsonContent(content) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("DeepSeek 未返回 JSON 对象");
  return parsed;
}

async function scheduleNextReminder() {
  await chrome.alarms.clear(ALARM_ID);
  const settings = await getSettings();
  const weekdays = new Set(settings.reviewWeekdays || []);
  if (!weekdays.size) return;
  const [hour, minute] = String(settings.reminderTime || "20:00").split(":").map(Number);
  const now = new Date();
  let next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (next <= now || !weekdays.has(next.getDay())) {
    do {
      next.setDate(next.getDate() + 1);
      next.setHours(hour, minute, 0, 0);
    } while (!weekdays.has(next.getDay()));
  }
  await chrome.alarms.create(ALARM_ID, { when: next.getTime() });
}

async function maybeNotifyDueCards(startupCheck) {
  try {
    const settings = await getSettings();
    const now = new Date();
    if (!settings.reviewWeekdays.includes(now.getDay())) return;

    if (startupCheck) {
      const [hour, minute] = settings.reminderTime.split(":").map(Number);
      const reminder = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
      if (now < reminder) return;
    }

    const today = todayLocal();
    const { lastNotifiedDate } = await chrome.storage.local.get("lastNotifiedDate");
    if (lastNotifiedDate === today) return;
    const result = await callNative("notebook.scan", { notebookPath: settings.notebookPath, today });
    const dueCount = result.cards.filter((card) => card.due).length;
    if (!dueCount) return;

    await chrome.notifications.create("vocabclip-review", {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon.png"),
      title: "VocabClip 复习提醒",
      message: `今天有 ${dueCount} 个单词需要复习`,
      priority: 1,
    });
    await chrome.storage.local.set({ lastNotifiedDate: today });
  } catch (error) {
    console.warn("VocabClip reminder skipped:", error?.message || error);
  }
}
