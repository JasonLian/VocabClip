import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addCardToNotebook,
  addCardToNotebookFile,
  nextEnabledDate,
  parseNotebook,
  recordReviewInNotebook,
  scanNotebook,
} from "../native-host/notebook.mjs";

const fixture = `用于记录个人英语学习中的高价值单词和短语，收录前先检查重复

## 待学习

- **colocate** /ˌkoʊloʊˈkeɪt/ v. 将相关事物放置在同一位置
  - 词形：colocated, colocating
  - 原始语境：Colocate artifacts.
  - 例句：Colocate related files.
  - 来源：用户指定
  - 加入：2026-08-04

## 复习中

## 已掌握
`;

test("现有无元数据词条会被识别为今日到期", () => {
  const result = scanNotebook(fixture, "2026-08-04");
  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].term, "colocate");
  assert.equal(result.cards[0].due, true);
  assert.equal(result.cards[0].stage, 0);
});

test("新增词条写入待学习并带可见复习字段", () => {
  const result = addCardToNotebook(fixture, {
    term: "artifact",
    ipa: "/ˈɑːrtɪfækt/",
    partOfSpeech: "n.",
    meaning: "技术流程产生的产物",
    originalContext: "Build artifacts",
    sourceTitle: "Example",
    sourceUrl: "https://example.com",
  }, { today: "2026-08-04" });
  assert.equal(result.duplicate, false);
  assert.match(result.text, /- \*\*artifact\*\* \/ˈɑːrtɪfækt\/ n\. 技术流程产生的产物/);
  assert.match(result.text, /复习阶段：0\/6/);
  assert.match(result.text, /下次复习：2026-08-04/);
  assert.ok(result.text.indexOf("**artifact**") < result.text.indexOf("## 复习中"));
});

test("重复词条不会重复创建，只追加新语境", () => {
  const result = addCardToNotebook(fixture, {
    term: " Colocate ",
    originalContext: "Colocate related configuration.",
    sourceTitle: "Docs",
    sourceUrl: "https://example.com/docs",
  }, { today: "2026-08-04", onDuplicate: "appendContext" });
  assert.equal(result.duplicate, true);
  assert.equal((result.text.match(/\*\*colocate\*\*/g) || []).length, 1);
  assert.match(result.text, /补充语境：Colocate related configuration\./);
});

test("认识后进入复习中并安排第一天复习", () => {
  const result = recordReviewInNotebook(fixture, {
    term: "colocate",
    rating: "known",
    today: "2026-08-04",
    reviewWeekdays: [0, 1, 2, 3, 4, 5, 6],
  });
  const parsed = parseNotebook(result.text, "2026-08-04");
  const card = parsed.cards[0];
  assert.equal(card.section, "复习中");
  assert.equal(card.stage, 1);
  assert.equal(card.nextReview, "2026-08-05");
  assert.ok(card.id);
});

test("周末被禁用时到期日顺延到周一", () => {
  assert.equal(nextEnabledDate("2026-08-07", 1, [1, 2, 3, 4, 5]), "2026-08-10");
});

test("第六阶段再次认识后移入已掌握", () => {
  const stageSix = fixture.replace(
    "  - 加入：2026-08-04",
    "  - 加入：2026-08-04\n  - 学习 ID：test-id\n  - 复习阶段：6/6\n  - 下次复习：2026-08-04\n  - 复习记录：",
  ).replace("## 待学习", "## 待学习\n\n## 临时").replace("## 复习中", "## 复习中");
  const valid = stageSix.replace("## 待学习\n\n## 临时\n\n", "## 待学习\n\n").replace("## 待学习\n\n- **colocate**", "## 待学习\n\n- **colocate**");
  const movedToReview = valid.replace("## 待学习\n\n- **colocate**", "## 待学习\n\n## 复习中\n\n- **colocate**").replace("\n## 复习中\n\n## 已掌握", "\n## 已掌握");
  const result = recordReviewInNotebook(movedToReview, {
    id: "test-id",
    term: "colocate",
    rating: "known",
    today: "2026-08-04",
    reviewWeekdays: [0, 1, 2, 3, 4, 5, 6],
  });
  const card = parseNotebook(result.text, "2026-08-04").cards[0];
  assert.equal(card.section, "已掌握");
  assert.equal(card.nextReview, "");
});

test("文件写入仅操作临时副本并生成备份", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "vocabclip-test-"));
  const notebookPath = path.join(tempDir, "words.md");
  const backupDir = path.join(tempDir, "backups");
  await writeFile(notebookPath, fixture, "utf8");
  await addCardToNotebookFile(notebookPath, { term: "legible", meaning: "清晰可读的" }, { today: "2026-08-04" }, backupDir);
  assert.match(await readFile(notebookPath, "utf8"), /\*\*legible\*\*/);
});
