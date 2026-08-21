import fs from "node:fs/promises";
import path from "node:path";
import {config, loadSettingsOverrides} from "../src/config.js";
import {askJSON, retryLLM, validateOutline} from "../src/ollama.js";
import {P, getGenre, resolveSetting, settingVars} from "../src/prompts/index.js";
import {cleanGeneratedStory} from "../src/utils.js";

const genreId = process.argv[2] ?? "drama";
const pr = getGenre(genreId);
if (pr.id !== genreId) { console.error(`Unknown genre: ${genreId}`); process.exit(1); }
const ideaFile = genreId === "ngontinh" ? "stories/example-ngontinh/idea.txt" : "stories/example/idea.txt";
const c = {...config, ...await loadSettingsOverrides(), chapters: 6, genre: pr.id};
const sv = settingVars(resolveSetting(c.genre, c.setting));
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
await fs.writeFile(path.join(out, "story_bible.json"), JSON.stringify(bible, null, 2));
console.log("coldOpen:", JSON.stringify(bible.coldOpen, null, 1));
console.log("tellDetail:", JSON.stringify(bible.tellDetail, null, 1));
console.log("secondPredator:", JSON.stringify(bible.secondPredator, null, 1));
console.log("truthWitness:", JSON.stringify(bible.truthWitness, null, 1));
console.log("ledger:", JSON.stringify(bible.ledger, null, 1));
console.log("sweetLadder:", JSON.stringify(bible.sweetLadder, null, 1));
console.log("doubtLadder:", JSON.stringify(bible.doubtLadder, null, 1));
console.log("heroineWound:", JSON.stringify(bible.heroineWound, null, 1));
console.log("maleLeadSecret:", JSON.stringify(bible.maleLeadSecret, null, 1));

console.log("\nOUT...");
const words = c.durationMinutes * c.targetWordsPerMinute;
const outline: any = await askJSON(c, P(pr.OUT, {...sv, CHAPTERS: String(c.chapters), WORDS: String(words), ACTS: pr.actsText(c.chapters), BIBLE: JSON.stringify(bible)}), .4, 3, x => validateOutline(x, c.chapters));
await fs.writeFile(path.join(out, "outline.json"), JSON.stringify(outline, null, 2));
for (const ch of outline.chapters)
  console.log(`ch${ch.chapter} irony="${ch.dramaticIrony}" | swoon="${String(ch.swoonLine ?? "-").slice(0, 60)}" | insert="${String(ch.antagonistInsert ?? ch.maleLeadInsert).slice(0, 70)}" | cliff="${String(ch.cliffhanger).slice(0, 60)}"`);

console.log("\nHOOK...");
const hook = cleanGeneratedStory(await retryLLM(c, P(pr.HOOK, {...sv, WORDS: String(pr.hookWords), BIBLE: JSON.stringify(bible), OUTLINE: JSON.stringify(outline)}), {temperature: .7, think: false}, 3, "Hook"));
await fs.writeFile(path.join(out, "hook.txt"), hook);
console.log(hook);
console.log(`\n[hook words=${hook.split(/\s+/).length}]`);
