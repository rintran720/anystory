import fs from "node:fs/promises";
import path from "node:path";
import {P, getGenre} from "../src/prompts/index.js";

// Bộ biến cố định: giá trị không quan trọng, chỉ cần mọi lần chạy đều như nhau
// để diff phản ánh đúng thay đổi của prompt chứ không phải của dữ liệu.
const VARS: Record<string, string> = {
  IDEA: "<IDEA>", CHAPTERS: "6", WORDS: "14400", ACTS: "<ACTS>", BIBLE: "<BIBLE>",
  COUNT: "5", CHAPTER: "<CHAPTER>", MEMORY: "<MEMORY>", SCENE: "<SCENE>",
  USED: "<USED>", RECENT: "<RECENT>", OUTLINE: "<OUTLINE>", ENDING: "<ENDING>",
  DRAFT: "<DRAFT>", STORY: "<STORY>", TEXT: "<TEXT>", TOTAL: "6", ISSUES: "<ISSUES>"
};

const g = getGenre(process.argv[2] ?? "drama");

const PROMPTS: [string, string][] = [
  ["ARCH", g.ARCH], ["OUT", g.OUT], ["SC", g.SC], ["WR", g.WR], ["HOOK", g.HOOK], ["OUTRO", g.OUTRO],
  ["MEM", g.MEM], ["EDIT", g.EDIT], ["CHECK", g.CHECK], ["REVIEW_CH", g.REVIEW_CH],
  ["REVIEW_SUM", g.REVIEW_SUM], ["FIXCH", g.FIXCH], ["FIXVERIFY", g.FIXVERIFY]
];

// Prompt và metadata nằm ở hai file riêng: file prompt phải diff sạch từng ký tự
// qua mọi lần refactor, nên không được lẫn thứ gì khác vào.
const body = PROMPTS.map(([name, tpl]) => `########## ${name} ##########\n${P(tpl, VARS)}`).join("\n\n");
const meta = `id=${g.id}\nlabel=${g.label}\nhookWords=${g.hookWords}\noutroWords=${g.outroWords}\nbibleRequired=${g.bibleRequired.join(",")}\nchapterCriteria=${g.chapterCriteria.join(",")}\nusedMemoryKeys=${g.usedMemoryKeys.join(",")}\nactsText(6)=${g.actsText(6)}`;

const dir = path.resolve("scripts/__snapshots__");
await fs.mkdir(dir, {recursive: true});
await fs.writeFile(path.join(dir, `${g.id}-prompts.txt`), body, "utf8");
await fs.writeFile(path.join(dir, `${g.id}-meta.txt`), meta, "utf8");
console.log(`wrote ${g.id}-prompts.txt (${body.length} chars, ${PROMPTS.length} prompts) + ${g.id}-meta.txt`);
