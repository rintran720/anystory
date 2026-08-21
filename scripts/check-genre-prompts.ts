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

// ─────────────────────────────────────────────────────────────────────────────
// Các khẳng định dưới đây tồn tại để một spine SAI bị chặn, không phải để một
// spine đúng được khen. Phép thử: gán NGONTINH.WR = DRAMA.WR phải làm script này
// đỏ. Trước vòng sửa thứ hai, nó xanh.
// ─────────────────────────────────────────────────────────────────────────────

const NAMES = ["ARCH","OUT","SC","WR","HOOK","OUTRO","MEM","EDIT","CHECK","REVIEW_CH","REVIEW_SUM","FIXCH","FIXVERIFY"] as const;
const wrRules = (s: string) => s.split("\n").filter(l => /^\d+\. /.test(l));

// WR là chữ ký của thể loại: số quy tắc, quy tắc riêng, và quy tắc của thể loại kia
must(d.WR !== n.WR, "the two genres share the same WR verbatim — the romance spine is not writing its own scenes");
must(wrRules(d.WR).length === 12, `drama WR should render 12 numbered rules, has ${wrRules(d.WR).length}`);
must(wrRules(n.WR).length === 15, `ngontinh WR should render 15 numbered rules, has ${wrRules(n.WR).length}`);
for (const r of ["NGÔI KỂ:", "NỘI TÂM TỰ TRÀO:", "CÂU THOẠI SÁT THƯƠNG:", "ĐIỆP CẤU TRÚC:", "KHÔNG BẠO LỰC:"]) {
  must(n.WR.includes(r), `ngontinh WR is missing its own rule ${r}`);
  must(!d.WR.includes(r), `drama WR carries the romance-only rule ${r}`);
}
for (const r of ["CÂU BÁO TRƯỚC:", "DƯ LUẬN:"]) {
  must(d.WR.includes(r), `drama WR lost its own rule ${r}`);
  must(!n.WR.includes(r), `ngontinh WR carries the drama-only rule ${r}`);
}

// Quy tắc 2 trỏ tới một quy tắc khác BẰNG SỐ; số đó phải trỏ đúng chỗ
for (const g of [d, n]) {
  const m = /Ngoại lệ DUY NHẤT là (.+?) ở quy tắc (\d+)\./.exec(g.WR);
  must(!!m, `${g.id} WR rule 2 no longer names its exception rule by number`);
  if (m) {
    const target = wrRules(g.WR)[Number(m[2]) - 1] ?? "";
    must(target.toLowerCase().includes(m[1].toLowerCase()),
      `${g.id} WR rule 2 names "${m[1]}" at rule ${m[2]}, but rule ${m[2]} is "${target.slice(0, 48)}…"`);
  }
}

// Ngôi thứ nhất: không chương nào của ngôn tình được nhìn từ mắt nam chính
must(!n.OUT.includes("mắt nam chính"), "ngontinh OUT still lets a whole chapter be seen from the male lead's eyes");
must(n.OUT.includes("LUÔN LUÔN là nữ chính"), "ngontinh OUT no longer pins povCharacter to the heroine");
must(d.OUT.includes("mắt phản diện"), "drama OUT lost its antagonist-POV chapters");

// Quy tắc nội tâm mỗi cảnh phải miễn trừ cảnh viết theo nam chính, ở CẢ BA chỗ khẳng định nó
const MONO_EXEMPT = `cảnh gánh maleLeadInsert viết theo nam chính nên không có câu nội tâm nào của "tôi"`;
for (const p of ["WR", "EDIT", "FIXCH"] as const)
  must((n[p] as string).includes(MONO_EXEMPT),
    `ngontinh ${p} demands one "tôi" inner-monologue line per scene without exempting the maleLeadInsert scene`);

// Thang xưng hô: WR chỉ được dùng đúng những nấc mà SC của chính thể loại đó chào
for (const g of [d, n])
  for (const r of ["mày-tao", "tôi-cô", "tôi-anh", "anh-em"])
    if (g.WR.includes(r))
      must(g.SC.includes(r), `${g.id} WR uses the pronoun register ${r} but its own SC never offers it`);
must(!n.WR.includes("tôi-cô"), "ngontinh WR still carries drama's tôi-cô cooling example");
must(!n.WR.includes("mày-tao"), "ngontinh WR offers the may-tao register");

// FIXVERIFY quyết định giữ hay trả lại bản sửa, nên nó phải biết đang đọc thể loại nào
must(d.FIXVERIFY.includes("truyện drama tiếng Việt"), "drama FIXVERIFY does not name its own genre");
must(n.FIXVERIFY.includes("truyện ngôn tình tiếng Việt"), "ngontinh FIXVERIFY does not name its own genre");
must(!d.FIXVERIFY.includes("ngôn tình"), "drama FIXVERIFY tells the judge it is reading a romance");
for (const p of NAMES) must(!(n[p] as string).includes("truyện drama"), `ngontinh ${p} calls the story a drama`);
for (const p of ["CHECK", "REVIEW_CH", "REVIEW_SUM", "EDIT", "FIXCH", "FIXVERIFY"] as const)
  must((n[p] as string).includes("ngôn tình"), `ngontinh ${p} never tells the judge which genre it is reading`);

// Trường nào ARCH đòi thì phải có nơi tiêu thụ, nếu không nó chỉ tốn token
must(n.OUT.includes("signatureLine"), "ngontinh asks ARCH for signatureLine but no downstream prompt ever uses it");

// actsText phải CHIA ĐÚNG 1..N thành ba hồi liền nhau, không phải chỉ trả về chuỗi khác rỗng
for (const g of [d, n]) {
  must(g.actsText(2) === "", `${g.id} actsText should return "" below 3 chapters`);
  for (const N of [6, 12, 24]) {
    const r = [...g.actsText(N).matchAll(/Chương (\d+)-(\d+)/g)].map(m => [Number(m[1]), Number(m[2])]);
    must(r.length === 3, `${g.id} actsText(${N}) does not describe exactly 3 acts, got ${r.length}`);
    must(r[0]?.[0] === 1, `${g.id} actsText(${N}) does not start at chapter 1`);
    must(r[2]?.[1] === N, `${g.id} actsText(${N}) does not end at chapter ${N}`);
    must(r.every((x, i) => i === 0 || x[0] === r[i - 1][1] + 1),
      `${g.id} actsText(${N}) acts are not contiguous: ${JSON.stringify(r)}`);
  }
}

if (fails.length) { console.error(fails.map(f => `FAIL ${f}`).join("\n")); process.exit(1); }
console.log(`all genre prompt invariants OK (${GENRES.length} genres)`);
