import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const SECTIONS = Object.freeze(["待学习", "复习中", "已掌握"]);
export const REVIEW_INTERVALS = Object.freeze([1, 2, 4, 7, 15, 30]);

export function normalizeTerm(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function parseNotebook(text, today = formatDate(new Date())) {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const endedWithNewline = text.endsWith("\n");
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (endedWithNewline && lines.at(-1) === "") lines.pop();
  const sectionRanges = findSectionRanges(lines);
  const cards = [];

  for (const section of SECTIONS) {
    const range = sectionRanges.get(section);
    if (!range) continue;
    for (let index = range.start + 1; index < range.end;) {
      const match = lines[index].match(/^- \*\*(.+?)\*\*(.*)$/);
      if (!match) {
        index += 1;
        continue;
      }
      let end = index + 1;
      while (end < range.end && !/^- \*\*(.+?)\*\*/.test(lines[end])) end += 1;
      const block = lines.slice(index, end);
      const fields = parseFields(block);
      const headline = parseHeadline(match[2]);
      const stage = parseStage(fields["复习阶段"]);
      const nextReview = validDate(fields["下次复习"]) ? fields["下次复习"] : (section === "已掌握" ? "" : today);
      cards.push({
        id: fields["学习 ID"] || "",
        term: match[1].trim(),
        normalizedTerm: normalizeTerm(match[1]),
        ipa: headline.ipa,
        partOfSpeech: headline.partOfSpeech,
        meaning: headline.meaning,
        forms: fields["词形"] || "",
        memoryAid: fields["辅助记忆"] || "",
        originalContext: fields["原始语境"] || "",
        example: fields["例句"] || "",
        source: fields["来源"] || "",
        stage,
        nextReview,
        reviewHistory: fields["复习记录"] || "",
        section,
        due: section !== "已掌握" && Boolean(nextReview) && nextReview <= today,
        start: index,
        end,
      });
      index = end;
    }
  }
  return { cards, lines, newline, endedWithNewline, sectionRanges };
}

export function scanNotebook(text, today) {
  const parsed = parseNotebook(text, today);
  validateNotebook(parsed);
  return {
    cards: parsed.cards.map(({ start, end, normalizedTerm, ...card }) => card),
    counts: Object.fromEntries(SECTIONS.map((section) => [section, parsed.cards.filter((card) => card.section === section).length])),
  };
}

export function addCardToNotebook(text, card, options = {}) {
  const today = options.today || formatDate(new Date());
  const parsed = parseNotebook(text, today);
  validateNotebook(parsed);
  const term = cleanInline(card?.term);
  if (!term) throw new Error("单词或短语不能为空");
  const duplicate = parsed.cards.find((item) => item.normalizedTerm === normalizeTerm(term));
  if (duplicate) {
    if (options.onDuplicate !== "appendContext") return { text, duplicate: true, changed: false, card: publicCard(duplicate) };
    const lines = [...parsed.lines];
    const additions = buildDuplicateAdditions(lines.slice(duplicate.start, duplicate.end), card);
    if (!additions.length) return { text, duplicate: true, changed: false, card: publicCard(duplicate) };
    const insertAt = contentEnd(lines, duplicate.start, duplicate.end);
    lines.splice(insertAt, 0, ...additions);
    return { text: joinNotebook(lines, parsed), duplicate: true, changed: true, card: publicCard(duplicate) };
  }

  const id = randomUUID();
  const block = formatCardBlock(card, { id, today });
  const lines = insertBlock([...parsed.lines], "待学习", block);
  return {
    text: joinNotebook(lines, parsed),
    duplicate: false,
    changed: true,
    card: { id, term, section: "待学习", stage: 0, nextReview: today },
  };
}

export function recordReviewInNotebook(text, input) {
  const today = validDate(input?.today) ? input.today : formatDate(new Date());
  const weekdays = normalizeWeekdays(input?.reviewWeekdays);
  const parsed = parseNotebook(text, today);
  validateNotebook(parsed);
  const card = parsed.cards.find((item) => (input.id && item.id === input.id) || item.normalizedTerm === normalizeTerm(input.term));
  if (!card) throw new Error("未找到要复习的词条，请重新载入");
  const rating = input.rating;
  if (!["known", "fuzzy", "forgot"].includes(rating)) throw new Error("无效的复习结果");

  let stage = card.stage;
  let nextReview;
  let targetSection = card.section;
  if (rating === "known") {
    if (stage >= REVIEW_INTERVALS.length) {
      targetSection = "已掌握";
      nextReview = "已完成";
    } else {
      nextReview = nextEnabledDate(today, REVIEW_INTERVALS[stage], weekdays);
      stage += 1;
      targetSection = "复习中";
    }
  } else if (rating === "fuzzy") {
    nextReview = nextEnabledDate(today, 1, weekdays);
    targetSection = stage === 0 && card.section === "待学习" ? "待学习" : "复习中";
  } else {
    stage = 0;
    nextReview = nextEnabledDate(today, 1, weekdays);
    targetSection = card.section === "待学习" ? "待学习" : "复习中";
  }

  const ratingLabel = { known: "认识", fuzzy: "模糊", forgot: "忘记" }[rating];
  const id = card.id || randomUUID();
  let block = trimTrailingBlank(parsed.lines.slice(card.start, card.end));
  block = setField(block, "学习 ID", id);
  block = setField(block, "复习阶段", `${stage}/${REVIEW_INTERVALS.length}`);
  block = setField(block, "下次复习", nextReview);
  const history = [card.reviewHistory, `${today} ${ratingLabel}`].filter(Boolean).join("；");
  block = setField(block, "复习记录", history);

  const lines = [...parsed.lines];
  if (targetSection === card.section) {
    lines.splice(card.start, card.end - card.start, ...block, "");
  } else {
    lines.splice(card.start, card.end - card.start);
    insertBlock(lines, targetSection, block);
  }
  return {
    text: joinNotebook(lines, parsed),
    changed: true,
    card: { id, term: card.term, stage, nextReview, section: targetSection },
  };
}

export function nextEnabledDate(baseDate, daysToAdd, weekdays) {
  const allowed = new Set(normalizeWeekdays(weekdays));
  const date = parseLocalDate(baseDate);
  date.setDate(date.getDate() + Math.max(1, Number(daysToAdd) || 1));
  while (!allowed.has(date.getDay())) date.setDate(date.getDate() + 1);
  return formatDate(date);
}

export async function scanNotebookFile(notebookPath, today) {
  const safePath = await validateNotebookPath(notebookPath);
  const text = await readFile(safePath, "utf8");
  return scanNotebook(text, today);
}

export async function addCardToNotebookFile(notebookPath, card, options, backupDir) {
  return mutateNotebookFile(notebookPath, backupDir, (text) => addCardToNotebook(text, card, options));
}

export async function recordReviewInNotebookFile(notebookPath, input, backupDir) {
  return mutateNotebookFile(notebookPath, backupDir, (text) => recordReviewInNotebook(text, input));
}

export async function validateNotebookPath(notebookPath) {
  if (typeof notebookPath !== "string" || !path.isAbsolute(notebookPath) || path.extname(notebookPath).toLowerCase() !== ".md") {
    throw new Error("单词本必须是已存在 Markdown 文件的绝对路径");
  }
  const info = await stat(notebookPath);
  if (!info.isFile()) throw new Error("单词本路径不是文件");
  if (info.size > 2 * 1024 * 1024) throw new Error("单词本超过 2 MB，已停止读取");
  return notebookPath;
}

async function mutateNotebookFile(notebookPath, backupDir, transform) {
  const safePath = await validateNotebookPath(notebookPath);
  const original = await readFile(safePath, "utf8");
  const result = transform(original);
  if (!result.changed || result.text === original) return result;
  await writeAtomically(safePath, original, result.text, backupDir);
  return result;
}

async function writeAtomically(filePath, original, updated, backupDir) {
  const info = await stat(filePath);
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `${path.basename(filePath)}.${stamp}.bak`);
  await copyFile(filePath, backupPath);
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.vocabclip-${process.pid}-${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, updated, { encoding: "utf8", mode: info.mode });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  await pruneBackups(backupDir, 20);
}

async function pruneBackups(backupDir, keep) {
  const files = (await readdir(backupDir)).filter((name) => name.endsWith(".bak")).sort().reverse();
  await Promise.all(files.slice(keep).map((name) => rm(path.join(backupDir, name), { force: true })));
}

function findSectionRanges(lines) {
  const headings = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^##\s+(.+?)\s*$/);
    if (match) headings.push({ name: match[1], index });
  }
  const ranges = new Map();
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (!SECTIONS.includes(heading.name)) continue;
    ranges.set(heading.name, { start: heading.index, end: headings[index + 1]?.index ?? lines.length });
  }
  return ranges;
}

function validateNotebook(parsed) {
  const missing = SECTIONS.filter((section) => !parsed.sectionRanges.has(section));
  if (missing.length) throw new Error(`单词本缺少分区：${missing.join("、")}`);
}

function parseFields(block) {
  const fields = {};
  for (const line of block.slice(1)) {
    const match = line.match(/^\s{2,}-\s+([^：]+)：\s*(.*)$/);
    if (match) fields[match[1].trim()] = match[2].trim();
  }
  return fields;
}

function parseHeadline(rest) {
  let value = rest.trim();
  let ipa = "";
  const ipaMatch = value.match(/^\/([^/]+)\/\s*/);
  if (ipaMatch) {
    ipa = `/${ipaMatch[1]}/`;
    value = value.slice(ipaMatch[0].length).trim();
  }
  let partOfSpeech = "";
  let meaning = value;
  const posMatch = value.match(/^([A-Za-z][A-Za-z./ -]*\.)\s+(.+)$/);
  if (posMatch) {
    partOfSpeech = posMatch[1].trim();
    meaning = posMatch[2].trim();
  }
  return { ipa, partOfSpeech, meaning };
}

function parseStage(value) {
  const stage = Number.parseInt(String(value || "0").split("/")[0], 10);
  return Number.isFinite(stage) ? Math.min(Math.max(stage, 0), REVIEW_INTERVALS.length) : 0;
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function parseLocalDate(value) {
  if (!validDate(value)) throw new Error("日期格式无效");
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeWeekdays(value) {
  const days = [...new Set((Array.isArray(value) ? value : [0, 1, 2, 3, 4, 5, 6]).map(Number).filter((day) => day >= 0 && day <= 6))];
  if (!days.length) throw new Error("至少需要一个学习日");
  return days;
}

function cleanInline(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function cleanTerm(value) {
  return cleanInline(value).replaceAll("**", "");
}

function formatCardBlock(card, metadata) {
  const term = cleanTerm(card.term);
  const headline = [card.ipa && cleanInline(card.ipa), card.partOfSpeech && cleanInline(card.partOfSpeech), card.meaning && cleanInline(card.meaning)].filter(Boolean).join(" ");
  const block = [`- **${term}**${headline ? ` ${headline}` : ""}`];
  const add = (label, value, includeEmpty = false) => {
    const cleaned = cleanInline(value);
    if (cleaned || includeEmpty) block.push(`  - ${label}：${cleaned}`);
  };
  add("词形", card.forms);
  add("辅助记忆", card.memoryAid);
  add("原始语境", card.originalContext);
  add("例句", card.example);
  add("来源", formatSource(card));
  add("加入", metadata.today);
  add("学习 ID", metadata.id);
  add("复习阶段", `0/${REVIEW_INTERVALS.length}`);
  add("下次复习", metadata.today);
  add("复习记录", "", true);
  return block;
}

function formatSource(card) {
  const title = cleanInline(card.sourceTitle || "网页剪藏").replace(/[\[\]]/g, "");
  const url = cleanInline(card.sourceUrl);
  return url ? `[${title}](${url})` : title;
}

function buildDuplicateAdditions(block, card) {
  const existing = block.join("\n");
  const additions = [];
  const context = cleanInline(card.originalContext);
  const source = formatSource(card);
  if (context && !existing.includes(context)) additions.push(`  - 补充语境：${context}`);
  if (source && source !== "网页剪藏" && !existing.includes(source)) additions.push(`  - 补充来源：${source}`);
  return additions;
}

function setField(block, label, value) {
  const next = [...block];
  const pattern = new RegExp(`^\\s{2,}-\\s+${escapeRegex(label)}：`);
  const index = next.findIndex((line) => pattern.test(line));
  const line = `  - ${label}：${cleanInline(value)}`;
  if (index >= 0) next[index] = line;
  else next.push(line);
  return next;
}

function insertBlock(lines, sectionName, block) {
  const ranges = findSectionRanges(lines);
  const range = ranges.get(sectionName);
  if (!range) throw new Error(`单词本缺少分区：${sectionName}`);
  let insertAt = range.end;
  while (insertAt > range.start + 1 && lines[insertAt - 1]?.trim() === "") insertAt -= 1;
  const insertion = [];
  if (insertAt > range.start + 1 && lines[insertAt - 1]?.trim() !== "") insertion.push("");
  insertion.push(...block, "");
  lines.splice(insertAt, 0, ...insertion);
  return lines;
}

function contentEnd(lines, start, end) {
  let index = end;
  while (index > start && lines[index - 1]?.trim() === "") index -= 1;
  return index;
}

function trimTrailingBlank(lines) {
  const next = [...lines];
  while (next.length && next.at(-1).trim() === "") next.pop();
  return next;
}

function joinNotebook(lines, parsed) {
  const normalized = [...lines];
  while (normalized.length > 1 && normalized.at(-1) === "" && normalized.at(-2) === "") normalized.pop();
  return normalized.join(parsed.newline) + (parsed.endedWithNewline ? parsed.newline : "");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function publicCard(card) {
  const { start, end, normalizedTerm, ...result } = card;
  return result;
}
