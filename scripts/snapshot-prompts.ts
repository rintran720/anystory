import fs from "node:fs/promises";
import path from "node:path";
import {P, ARCH, OUT, SC, WR, HOOK, OUTRO, MEM, EDIT, CHECK, REVIEW_CH, REVIEW_SUM, FIXCH, FIXVERIFY} from "../src/prompts.js";

// Bộ biến cố định: giá trị không quan trọng, chỉ cần mọi lần chạy đều như nhau
// để diff phản ánh đúng thay đổi của prompt chứ không phải của dữ liệu.
const VARS: Record<string, string> = {
  IDEA: "<IDEA>", CHAPTERS: "6", WORDS: "14400", ACTS: "<ACTS>", BIBLE: "<BIBLE>",
  COUNT: "5", CHAPTER: "<CHAPTER>", MEMORY: "<MEMORY>", SCENE: "<SCENE>",
  USED: "<USED>", RECENT: "<RECENT>", OUTLINE: "<OUTLINE>", ENDING: "<ENDING>",
  DRAFT: "<DRAFT>", STORY: "<STORY>", TEXT: "<TEXT>", TOTAL: "6", ISSUES: "<ISSUES>"
};

const PROMPTS: [string, string][] = [
  ["ARCH", ARCH], ["OUT", OUT], ["SC", SC], ["WR", WR], ["HOOK", HOOK], ["OUTRO", OUTRO],
  ["MEM", MEM], ["EDIT", EDIT], ["CHECK", CHECK], ["REVIEW_CH", REVIEW_CH],
  ["REVIEW_SUM", REVIEW_SUM], ["FIXCH", FIXCH], ["FIXVERIFY", FIXVERIFY]
];

const body = PROMPTS.map(([name, tpl]) => `########## ${name} ##########\n${P(tpl, VARS)}`).join("\n\n");
const outFile = path.resolve("scripts/__snapshots__/drama-prompts.txt");
await fs.mkdir(path.dirname(outFile), {recursive: true});
await fs.writeFile(outFile, body, "utf8");
console.log(`wrote ${outFile} (${body.length} chars, ${PROMPTS.length} prompts)`);
