import {getGenre, GENRES} from "../src/prompts/index.js";

const fails: string[] = [];
const must = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

const d = getGenre("drama");
const n = getGenre("ngontinh");

// Thể loại phải phân giải đúng, không âm thầm rơi về drama
must(n.id === "ngontinh", "getGenre('ngontinh') fell back to drama — spine not registered");
must(GENRES.map(g => g.id).sort().join(",") === "drama,ngontinh", "GENRES does not list exactly the two genres");

// Fallback an toàn cho truyện cũ và giá trị rác
for (const bad of [undefined, null, "", "khong-ton-tai", 123, {}])
  must(getGenre(bad as any).id === "drama", `getGenre(${JSON.stringify(bad)}) must fall back to drama`);

// Ngôn tình không được kéo theo xương sống của drama
for (const f of ["escalationLadder", "secondPredator", "truthWitness", "tellDetail", "coldOpen", "antagonistWound"])
  must(!n.ARCH.includes(f), `ngontinh ARCH still asks for the drama-only bible field ${f}`);
for (const f of ["sweetLadder", "doubtLadder", "maleLeadSecret", "heroineWound", "rival", "familyGate", "openingConfession", "happyEnding", "signatureLine"])
  must(n.ARCH.includes(f), `ngontinh ARCH is missing its own bible field ${f}`);

for (const f of ["escalationType", "pressureLevel", "antagonistInsert", "protagonistAction"])
  must(!n.OUT.includes(f), `ngontinh OUT still asks for the drama-only outline field ${f}`);
for (const f of ["sweetBeat", "doubtBeat", "intimacyLevel", "heroineAction", "maleLeadInsert", "swoonLine"])
  must(n.OUT.includes(f), `ngontinh OUT is missing its own outline field ${f}`);

// Công thức lời dẫn / lời kết của kênh drama không được lẫn sang
must(!n.HOOK.includes("Mời quý vị cùng lắng nghe"), "ngontinh HOOK still carries the drama sign-off");
must(!n.OUTRO.includes("Quý thính giả thân mến"), "ngontinh OUTRO still opens like the drama channel");
must(n.hookWords === 70 && n.outroWords === 150, "ngontinh hook/outro word counts wrong");
must(d.hookWords === 260 && d.outroWords === 450, "drama hook/outro word counts changed");

// Thể loại này không có bạo lực ngôn từ
must(!n.SC.includes("mày-tao"), "ngontinh SC still offers the may-tao register");

// Khóa điểm phải khớp giữa khai báo và prompt
must(d.chapterCriteria.join(",") === "hook,nhipDo,showKhongTell,hoiThoai,cangThang,nhanVat", "drama chapterCriteria changed");
must(n.chapterCriteria.join(",") === "hook,nhipDo,showKhongTell,hoiThoai,ngotNgao,namChinh", "ngontinh chapterCriteria wrong");
for (const g of [d, n]) {
  for (const k of g.chapterCriteria)
    must(g.REVIEW_CH.includes(`"${k}"`), `${g.id} REVIEW_CH prompt does not declare the key ${k}`);
  for (const k of ["cauTruc", "vongCungNhanVat", "caoTrao", "ketThuc", "doMoiLa", "bamMoralMotif"])
    must(g.REVIEW_SUM.includes(`"${k}"`), `${g.id} REVIEW_SUM prompt does not declare the shared key ${k}`);
  for (const k of g.bibleRequired)
    must(g.ARCH.includes(k), `${g.id} lists ${k} in bibleRequired but ARCH never asks for it`);
  for (const k of g.usedMemoryKeys)
    must(g.MEM.includes(k), `${g.id} lists ${k} in usedMemoryKeys but MEM never tracks it`);
  must(g.actsText(6).length > 0 && g.actsText(2) !== undefined, `${g.id} actsText broken`);
}

// Bối cảnh là một trục riêng: spine chọn mặc định, và không được tự viết bối cảnh vào prompt
must(n.defaultSetting === "china", "ngontinh defaultSetting must be china — the reference story is Chinese-set");
must(d.defaultSetting === "vietnam", "drama defaultSetting must stay vietnam");
for (const g of [d, n])
  for (const p of ["ARCH", "SC", "WR", "FIXCH"] as const)
    must(!(g[p] as string).includes("Việt Nam"), `${g.id} ${p} hardcodes "Việt Nam" — the setting pack owns that now`);

if (fails.length) { console.error(fails.map(f => `FAIL ${f}`).join("\n")); process.exit(1); }
console.log(`all genre prompt invariants OK (${GENRES.length} genres)`);
