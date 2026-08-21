import fs from "node:fs/promises";
import path from "node:path";
import {P, getGenre} from "../src/prompts/index.js";
import {SETTINGS} from "../src/prompts/settings.js";
import type {SettingId} from "../src/types.js";

// Bộ biến cố định: giá trị không quan trọng, chỉ cần mọi lần chạy đều như nhau
// để diff phản ánh đúng thay đổi của prompt chứ không phải của dữ liệu.
const VARS: Record<string, string> = {
  IDEA: "<IDEA>", CHAPTERS: "6", WORDS: "14400", ACTS: "<ACTS>", BIBLE: "<BIBLE>",
  COUNT: "5", CHAPTER: "<CHAPTER>", MEMORY: "<MEMORY>", SCENE: "<SCENE>",
  USED: "<USED>", RECENT: "<RECENT>", OUTLINE: "<OUTLINE>", ENDING: "<ENDING>",
  DRAFT: "<DRAFT>", STORY: "<STORY>", TEXT: "<TEXT>", TOTAL: "6", ISSUES: "<ISSUES>",
  HOOK: "<HOOK>", FEEDBACK: "<FEEDBACK>", INDEXES: "<INDEXES>",
  SET_NAMES: "<SET_NAMES>", SET_DETAIL: "<SET_DETAIL>", SET_PROP: "<SET_PROP>",
  SET_PROVERB: "<SET_PROVERB>", SET_FOREIGN: "<SET_FOREIGN>"
};

const g = getGenre(process.argv[2] ?? "drama");

const PROMPTS: [string, string][] = [
  ["ARCH", g.ARCH], ["OUT", g.OUT], ["SC", g.SC], ["WR", g.WR], ["HOOK", g.HOOK], ["HOOKFIX", g.HOOKFIX], ["OUTRO", g.OUTRO],
  ["MEM", g.MEM], ["EDIT", g.EDIT], ["CHECK", g.CHECK], ["REVIEW_CH", g.REVIEW_CH],
  ["REVIEW_SUM", g.REVIEW_SUM], ["FIXCH", g.FIXCH], ["FIXSPAN", g.FIXSPAN], ["FIXVERIFY", g.FIXVERIFY]
];

// Prompt và metadata nằm ở hai file riêng: file prompt phải diff sạch từng ký tự
// qua mọi lần refactor, nên không được lẫn thứ gì khác vào.
const body = PROMPTS.map(([name, tpl]) => `########## ${name} ##########\n${P(tpl, VARS)}`).join("\n\n");
const meta = `id=${g.id}\nlabel=${g.label}\nhookWords=${g.hookWords}\noutroWords=${g.outroWords}\nbibleRequired=${g.bibleRequired.join(",")}\nchapterCriteria=${g.chapterCriteria.join(",")}\nusedMemoryKeys=${g.usedMemoryKeys.join(",")}\nactsText(6)=${g.actsText(6)}`;

// Bối cảnh không phụ thuộc thể loại nên chụp riêng một file: sửa mô tả bối cảnh
// cũng phải nhìn thấy được trong diff dù không đụng vào prompt nào.
const settingsBody = (Object.keys(SETTINGS) as SettingId[]).map(id => {
  const s = SETTINGS[id];
  return `########## ${id} ##########\nlabel=${s.label}\nnames=${s.names}\ndetail=${s.detail}\nprop=${s.prop}\nproverb=${s.proverb}\nforeign=${s.foreign}`;
}).join("\n\n");

const dir = path.resolve("scripts/__snapshots__");
await fs.mkdir(dir, {recursive: true});
await fs.writeFile(path.join(dir, `${g.id}-prompts.txt`), body, "utf8");
await fs.writeFile(path.join(dir, `${g.id}-meta.txt`), meta, "utf8");
await fs.writeFile(path.join(dir, "settings.txt"), settingsBody, "utf8");
console.log(`wrote ${g.id}-prompts.txt (${body.length} chars, ${PROMPTS.length} prompts) + ${g.id}-meta.txt + settings.txt`);
