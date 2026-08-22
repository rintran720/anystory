import fs from "node:fs/promises";
import path from "node:path";
import {config, loadSettingsOverrides} from "../src/config.js";
import {askJSON, retryLLM, validateOutline} from "../src/ollama.js";
import {P, getGenre, resolveSetting, settingVars} from "../src/prompts/index.js";
import {cleanGeneratedStory} from "../src/utils.js";

const genreId = process.argv[2] ?? "drama";
const pr = getGenre(genreId);
if (pr.id !== genreId) { console.error(`Unknown genre: ${genreId}`); process.exit(1); }
const IDEA_FILES: Record<string, string> = {ngontinh: "stories/example-ngontinh/idea.txt", hoiquy: "stories/example-hoiquy/idea.txt"};
// Thiếu một nhánh ở đây thì thể loại mới bị smoke-test bằng ý tưởng của DRAMA và đọc ra
// như thể ARCH của chính nó hỏng - lỗi im lặng, tốn một lượt gọi để hiểu nhầm.
const ideaFile = IDEA_FILES[genreId] ?? "stories/example/idea.txt";
// Hình dạng truyện của chính thể loại (hồi quy: 33 phút, 4 chương) thắng cấu hình chung,
// y như server làm — nếu không, bản smoke đo ra một truyện dài gấp đôi thể loại nhắm tới.
const c = {...config, ...await loadSettingsOverrides(), chapters: 6, ...(pr.defaults ?? {}), genre: pr.id};
const sid = resolveSetting(c.genre, c.setting);
const sv = settingVars(sid);
const out = path.resolve("output", `_smoke-${pr.id}`);
await fs.mkdir(out, {recursive: true});
const idea = (await fs.readFile(ideaFile, "utf8")).trim();

console.log("ARCH...");
const bible: any = await askJSON(c, P(pr.ARCH, {...sv, IDEA: idea, CHAPTERS: String(c.chapters)}), .4, 3, x => {
  for (const k of pr.bibleRequired) if (!(k in x)) throw Error(`Bible missing ${k}`);
});
const chapterFields: [string, any][] = [];
for (const [k, v] of Object.entries(bible)) {
  if (k.endsWith("Chapter")) chapterFields.push([k, v]);
  else if (v && typeof v === "object" && !Array.isArray(v))
    for (const [k2, v2] of Object.entries(v as any)) if (k2.endsWith("Chapter")) chapterFields.push([`${k}.${k2}`, v2]);
}
for (const [k, v] of chapterFields)
  console.log(`  ${v >= 1 && v <= c.chapters ? "OK " : "OUT-OF-RANGE"} ${k} = ${v} (1..${c.chapters})`);
// generateStory đóng dấu hai trường này vào bible; đường iterate rẻ này phải đóng dấu
// giống hệt, nếu không output/_smoke-* đọc ra như một truyện drama đời cũ.
bible.genreId = pr.id;
bible.settingId = sid;
await fs.writeFile(path.join(out, "story_bible.json"), JSON.stringify(bible, null, 2));
// In trường craft của CHÍNH spine đang chạy. Danh sách cứng của drama+ngôn tình sẽ đổ ra
// một loạt "undefined" cho thể loại thứ ba và đọc như thể ARCH của nó hỏng.
const PLAIN = new Set(["title", "genre", "theme", "premise", "tone", "characters", "setting",
  "mainConflict", "secondaryConflicts", "titleCandidates", "genreId", "settingId"]);
for (const [k, v] of Object.entries(bible))
  if (!PLAIN.has(k)) console.log(`${k}:`, JSON.stringify(v, null, 1));

console.log("\nOUT...");
const words = c.durationMinutes * c.targetWordsPerMinute;
const outline: any = await askJSON(c, P(pr.OUT, {...sv, CHAPTERS: String(c.chapters), WORDS: String(words), ACTS: pr.actsText(c.chapters), BIBLE: JSON.stringify(bible)}), .4, 3, x => validateOutline(x, c.chapters));
await fs.writeFile(path.join(out, "outline.json"), JSON.stringify(outline, null, 2));
// Cùng lý do: mỗi spine có tên trường riêng, in theo tên cứng là in ra "undefined".
const OUTLINE_PLAIN = new Set(["chapter", "title", "purpose", "conflict", "emotionalState",
  "reveal", "climax", "estimatedWords", "povCharacter"]);
for (const ch of outline.chapters) {
  const extra = Object.entries(ch).filter(([k]) => !OUTLINE_PLAIN.has(k))
    .map(([k, v]) => `${k}="${(typeof v === "object" && v ? JSON.stringify(v) : String(v ?? "-")).slice(0, 55)}"`).join(" | ");
  console.log(`ch${ch.chapter} ${extra}`);
}

console.log("\nHOOK...");
const hook = cleanGeneratedStory(await retryLLM(c, P(pr.HOOK, {...sv, WORDS: String(pr.hookWords), BIBLE: JSON.stringify(bible), OUTLINE: JSON.stringify(outline)}), {temperature: .7, think: false}, 3, "Hook"));
await fs.writeFile(path.join(out, "hook.txt"), hook);
console.log(hook);
console.log(`\n[hook words=${hook.split(/\s+/).length}]`);
