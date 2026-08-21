import fs from "node:fs/promises";
import path from "node:path";
import {config, loadSettingsOverrides} from "../src/config.js";
import {askJSON, retryLLM, validateOutline} from "../src/ollama.js";
import {P, getGenre, resolveSetting, settingVars} from "../src/prompts/index.js";
import {cleanGeneratedStory} from "../src/utils.js";

const pr = getGenre("drama");
const c = {...config, ...await loadSettingsOverrides(), chapters: 6};
const sv = settingVars(resolveSetting(c.genre, c.setting));
const out = path.resolve("output", "_smoke");
await fs.mkdir(out, {recursive: true});
const idea = (await fs.readFile("stories/example/idea.txt", "utf8")).trim();

console.log("ARCH...");
const bible: any = await askJSON(c, P(pr.ARCH, {...sv, IDEA: idea, CHAPTERS: String(c.chapters)}), .4, 3, x => {
  for (const k of ["title", "moral", "motif", "escalationLadder", "coldOpen", "tellDetail", "secondPredator", "truthWitness", "ledger"])
    if (!(k in x)) throw Error(`Bible missing ${k}`);
});
for (const [k, v] of [["motif.invertChapter", bible.motif?.invertChapter], ["antagonistWound.revealChapter", bible.antagonistWound?.revealChapter], ["tellDetail.noticeChapter", bible.tellDetail?.noticeChapter], ["secondPredator.betrayalChapter", bible.secondPredator?.betrayalChapter]] as [string, any][])
  console.log(`  ${v >= 1 && v <= c.chapters ? "OK " : "OUT-OF-RANGE"} ${k} = ${v} (1..${c.chapters})`);
await fs.writeFile(path.join(out, "story_bible.json"), JSON.stringify(bible, null, 2));
console.log("coldOpen:", JSON.stringify(bible.coldOpen, null, 1));
console.log("tellDetail:", JSON.stringify(bible.tellDetail, null, 1));
console.log("secondPredator:", JSON.stringify(bible.secondPredator, null, 1));
console.log("truthWitness:", JSON.stringify(bible.truthWitness, null, 1));
console.log("ledger:", JSON.stringify(bible.ledger, null, 1));

console.log("\nOUT...");
const acts = "Chương 1-2: MỞ ĐẦU. Chương 3-4: NỘI DUNG CHÍNH. Chương 5-6: CAO TRÀO.";
const outline: any = await askJSON(c, P(pr.OUT, {...sv, CHAPTERS: "6", WORDS: "14400", ACTS: acts, BIBLE: JSON.stringify(bible)}), .4, 3, validateOutline);
await fs.writeFile(path.join(out, "outline.json"), JSON.stringify(outline, null, 2));
for (const ch of outline.chapters)
  console.log(`ch${ch.chapter} irony="${ch.dramaticIrony}" | insert="${String(ch.antagonistInsert).slice(0, 90)}" | cliff="${String(ch.cliffhanger).slice(0, 70)}"`);

console.log("\nHOOK...");
const hook = cleanGeneratedStory(await retryLLM(c, P(pr.HOOK, {...sv, WORDS: "260", BIBLE: JSON.stringify(bible), OUTLINE: JSON.stringify(outline)}), {temperature: .7, think: false}, 3, "Hook"));
await fs.writeFile(path.join(out, "hook.txt"), hook);
console.log(hook);
console.log(`\n[hook words=${hook.split(/\s+/).length}]`);
