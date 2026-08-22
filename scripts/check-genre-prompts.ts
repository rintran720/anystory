import {getGenre, GENRES, SETTINGS, SETTINGS_LIST, settingVars, IDEA, FIDELITY} from "../src/prompts/index.js";
import {MEMORY_CAPS} from "../src/utils.js";

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

const NAMES = ["ARCH","OUT","SC","WR","HOOK","HOOKFIX","OUTRO","MEM","EDIT","CHECK","REVIEW_CH","REVIEW_SUM","FIXCH","FIXSPAN","FIXVERIFY"] as const;
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

// ─────────────────────────────────────────────────────────────────────────────
// Trục bối cảnh. Các khẳng định "Việt Nam" ở trên chỉ bắt được kiểu phá hoại viết
// thẳng tên nước vào prompt; chúng mù trước kiểu phá hoại ngược lại và nguy hiểm hơn:
// XOÁ biến {{SET_*}} đi rồi thay bằng chữ cứng. Prompt vẫn chạy, truyện vẫn ra, chỉ là
// ra sai thế giới — và riêng {{SET_FOREIGN}} trong FIXCH thì bản sửa sẽ xoá luôn tên
// Hán-Việt của cả dàn nhân vật ở bối cảnh Trung Quốc.
// Bảng dưới là bảng ĐẦY ĐỦ: biến nào phải nằm ở prompt nào, và không được nằm chỗ khác.
const SET_SLOTS: Record<string, Record<string, string>> = {
  // Ngôn tình cố ý KHÔNG có {{SET_PROVERB}}: HOOK của nó cấm mở bằng tục ngữ.
  // {{SET_JUDGE}} là biến DUY NHẤT nằm ở nhiều prompt: cả ba prompt chấm điểm đều phải
  // biết đang đọc thế giới nào, nếu không chúng chấm truyện Trung Quốc theo chuẩn Việt.
  drama: {ARCH: "{{SET_NAMES}}", SC: "{{SET_PROP}}", WR: "{{SET_DETAIL}}", HOOK: "{{SET_PROVERB}}", FIXCH: "{{SET_FOREIGN}}", REVIEW_CH: "{{SET_JUDGE}}", REVIEW_SUM: "{{SET_JUDGE}}", CHECK: "{{SET_JUDGE}}"},
  ngontinh: {ARCH: "{{SET_NAMES}}", SC: "{{SET_PROP}}", WR: "{{SET_DETAIL}}", FIXCH: "{{SET_FOREIGN}}", REVIEW_CH: "{{SET_JUDGE}}", REVIEW_SUM: "{{SET_JUDGE}}", CHECK: "{{SET_JUDGE}}"}
};
const SET_VARS = new Set(Object.keys(settingVars("vietnam")).map(k => `{{${k}}}`));
must(SET_VARS.size === 6, `settingVars fills ${SET_VARS.size} variables, the prompts are written against 6`);
for (const g of [d, n]) {
  const slots = SET_SLOTS[g.id];
  for (const [p, v] of Object.entries(slots))
    must((g[p as keyof typeof g] as string).includes(v),
      `${g.id} ${p} no longer carries ${v} — that prompt has stopped following the setting`);
  for (const p of NAMES)
    for (const m of (g[p] as string).matchAll(/\{\{SET_[A-Z_]*\}\}/g)) {
      must(SET_VARS.has(m[0]), `${g.id} ${p} uses ${m[0]}, which settingVars never fills — it ships to the model literally`);
      must(slots[p] === m[0], `${g.id} ${p} carries ${m[0]}, which the setting map does not put there`);
    }
}
must(!n.HOOK.includes("{{SET_PROVERB}}"), "ngontinh HOOK now carries {{SET_PROVERB}} — its hook is not allowed to open on a proverb");

// ─────────────────────────────────────────────────────────────────────────────
// HOOKFIX viết lại lời dẫn cho dễ nghe. Nó chạy NGOÀI pipeline sinh truyện, từ một nút
// bấm, nên không có stage nào phía sau đỡ lỗi giúp: prompt sai là ghi đè thẳng hook.txt.
const HOOKFIX_VARS = new Set(["{{HOOK}}", "{{BIBLE}}", "{{WORDS}}", "{{FEEDBACK}}"]);
for (const g of [d, n]) {
  for (const v of HOOKFIX_VARS)
    must(g.HOOKFIX.includes(v), `${g.id} HOOKFIX no longer carries ${v} — rewriteHook fills it, so the prompt would lose it silently`);
  // rewriteHook điền đúng ba biến trên và không điền gì khác. Biến thứ tư lọt vào đây sẽ
  // được gửi nguyên chữ {{...}} cho model. Đây cũng là chốt chặn cho {{SET_FOREIGN}}:
  // HOOKFIX cố ý không biết bối cảnh, vì câu dọn "từ nước ngoài" chính là thứ từng suýt
  // xoá sạch tên nhân vật Trung Quốc khỏi một chương đã viết xong.
  for (const m of g.HOOKFIX.matchAll(/\{\{[A-Z_]+\}\}/g))
    must(HOOKFIX_VARS.has(m[0]), `${g.id} HOOKFIX uses ${m[0]}, which rewriteHook never fills — it ships to the model literally`);
  must(g.HOOKFIX.includes("NÓI CHO DỄ HIỂU"), `${g.id} HOOKFIX lost the plain-language block, which is the entire point of the button`);
  // "Dễ hiểu" một mình đẻ ra văn cụt: bản đầu bảo model "câu nào dài hơn thì cắt đôi" và
  // nó trả về ba mảnh không chủ ngữ liên tiếp - dễ nghe từng chữ, nhưng nghe như đọc gạch
  // đầu dòng. Luật chống chặt câu là thứ giữ cho dễ hiểu không nuốt mất mượt mà.
  must(g.HOOKFIX.includes("KHÔNG chặt làm đôi"), `${g.id} HOOKFIX no longer stops the model chopping long sentences into fragments`);
  must(g.HOOKFIX.includes("GIỮ NGUYÊN tên riêng"), `${g.id} HOOKFIX no longer protects the cast's proper names`);
  must(g.HOOKFIX.includes("không nói cái kết"), `${g.id} HOOKFIX no longer forbids spoiling the ending`);
}
must(d.HOOKFIX.includes("Mời quý vị cùng lắng nghe."), "drama HOOKFIX lets the rewrite drop the channel's fixed closing line");
must(!n.HOOKFIX.includes("Mời quý vị cùng lắng nghe."), "ngontinh HOOKFIX pastes the drama channel's closing line into a romance");
must(n.HOOKFIX.includes('xưng "tôi"'), "ngontinh HOOKFIX no longer holds the heroine's first-person voice");
must(!d.HOOKFIX.includes("nữ chính"), "drama HOOKFIX has picked up the romance spine's heroine");

// ─────────────────────────────────────────────────────────────────────────────
// Ranh giới của tính năng "viết lại từ link YouTube". Bản ghi lời của video gốc chỉ được
// phép có ĐÚNG MỘT người đọc là prompt IDEA. Nếu {{TRANSCRIPT}} lọt vào bất kỳ prompt nào
// của spine, các stage viết văn sẽ nhìn thấy câu chữ của video gốc - lúc đó sản phẩm thôi
// không còn là "cùng một cốt truyện" mà thành diễn đạt lại tác phẩm của người khác, đúng
// thứ hệ thống bản quyền của YouTube bắt và thổi còi cả kênh. Đây là khẳng định biến lời
// hứa đó thành thứ kiểm tra được.
must(IDEA.includes("{{TRANSCRIPT}}"), "IDEA no longer receives the transcript it exists to read");
must(IDEA.includes("{{FIDELITY}}"), "IDEA lost the fidelity slot, so every level renders the same prompt");
for (const g of [d, n])
  for (const name of NAMES)
    must(!(g[name] as string).includes("{{TRANSCRIPT}}"),
      `${g.id} ${name} carries {{TRANSCRIPT}} — the source video's wording must never reach a prompt that writes prose`);
for (const level of ["loose", "frame", "tight"])
  must((FIDELITY[level] ?? "").length > 40, `fidelity level "${level}" is missing or empty, so it silently falls back to loose`);

// ─────────────────────────────────────────────────────────────────────────────
// FIXSPAN sửa từng đoạn thay vì cả chương, để thu nhỏ bán kính nổ của một lượt sửa. Nó
// ghi đè chương đã viết xong, nên sai ở đây đắt ngang FIXCH.
const FIXSPAN_VARS = new Set(["{{BIBLE}}", "{{CHAPTER}}", "{{ISSUES}}", "{{TEXT}}", "{{INDEXES}}"]);
for (const g of [d, n]) {
  for (const v of FIXSPAN_VARS)
    must(g.FIXSPAN.includes(v), `${g.id} FIXSPAN no longer carries ${v} — fixStory fills it, so the prompt would lose it silently`);
  // Cùng chốt chặn như HOOKFIX: FIXSPAN cố ý KHÔNG biết bối cảnh. {{SET_FOREIGN}} là câu
  // dọn "từ nước ngoài" từng suýt xoá sạch tên nhân vật Trung Quốc khỏi một chương, và
  // FIXSPAN cũng ghi đè chương y như FIXCH. Nó tự bảo vệ tên riêng bằng chữ cứng.
  for (const m of g.FIXSPAN.matchAll(/\{\{[A-Z_]+\}\}/g))
    must(FIXSPAN_VARS.has(m[0]), `${g.id} FIXSPAN uses ${m[0]}, which fixStory never fills — it ships to the model literally`);
  must(g.FIXSPAN.includes("giữ nguyên tình tiết"), `${g.id} FIXSPAN no longer freezes the plot`);
  must(g.FIXSPAN.includes("kể cả tên Hán-Việt"), `${g.id} FIXSPAN no longer protects Sino-Vietnamese names`);
  must(g.FIXSPAN.includes("MỘT ĐỔI MỘT"), `${g.id} FIXSPAN no longer forbids merging or splitting paragraphs — the splice counts on one-for-one`);
  must(g.FIXSPAN.includes("<<<SỬA>>>"), `${g.id} FIXSPAN no longer tells the model which marker selects a paragraph`);
  must(g.FIXSPAN.includes("NÓI CHO DỄ HIỂU"), `${g.id} FIXSPAN lost the plain-language block that HOOKFIX shares`);
  must(g.FIXSPAN.includes("KHÔNG chặt làm đôi"), `${g.id} FIXSPAN no longer stops the model chopping sentences into fragments`);
}
must(n.FIXSPAN.includes("GIỮ GIỌNG"), "ngontinh FIXSPAN dropped the do-not-flatten-the-voice rule its FIXCH carries");
must(!d.FIXSPAN.includes("GIỮ GIỌNG"), "drama FIXSPAN picked up the romance spine's voice rule");

// Mỗi SettingPack phải đủ chữ: một trường rỗng không làm gì đổ, nó chỉ lặng lẽ dán một
// khoảng trắng vào đúng chỗ đáng ra phải mô tả cả một thế giới.
const PACK_FIELDS = ["label", "names", "detail", "prop", "proverb", "foreign"] as const;
for (const [id, pack] of Object.entries(SETTINGS)) {
  must(pack.id === id, `SETTINGS["${id}"] holds a pack whose id is "${pack.id}"`);
  for (const f of PACK_FIELDS)
    must(typeof pack[f] === "string" && pack[f].trim().length > 0, `SettingPack ${id} has an empty ${f}`);
  must(SETTINGS_LIST.some(s => s.id === id), `setting ${id} exists but is not offered in SETTINGS_LIST`);
}
// Mệnh đề foreign của Trung Quốc phải là mệnh đề ĐẢO, không phải bản sao của Việt Nam.
must(SETTINGS.china.foreign !== SETTINGS.vietnam.foreign, "china foreign clause is a copy of vietnam's — the fix pass will delete the Han-Viet cast");
must(SETTINGS.china.foreign.includes("GIỮ NGUYÊN"), "china foreign clause no longer orders the editor to KEEP the Han-Viet names");

// `judge` là `foreign` của tầng chấm điểm, và hỏng theo đúng kiểu ấy. Không có nó, prompt
// chấm chỉ đọc thấy "tiếng Việt" rồi ghi lỗi "thoại thiếu tự nhiên so với tâm lý người
// Việt" cho một truyện đặt ở Trung Quốc — rồi lượt sửa sau đọc chính lời phê đó làm chỉ
// thị và kéo truyện về Việt Nam. Sai lặng lẽ: báo cáo vẫn đẹp, điểm vẫn có, chỉ là chấm
// nhầm thế giới.
must(SETTINGS.china.judge !== SETTINGS.vietnam.judge, "china judge clause is a copy of vietnam's — a Chinese-set story will be marked down for not being Vietnamese");
must(SETTINGS.china.judge.includes("KHÔNG trừ điểm"), "china judge clause no longer forbids docking points for un-Vietnamese behaviour");
must(SETTINGS.vietnam.judge.includes("Việt Nam"), "vietnam judge clause no longer names its own setting");
for (const g of [d, n]) {
  must(!g.REVIEW_CH.includes("người Việt"), `${g.id} REVIEW_CH hardcodes "người Việt" — it will judge every setting by Vietnamese manners`);
  must(!g.REVIEW_SUM.includes("người Việt"), `${g.id} REVIEW_SUM hardcodes "người Việt"`);
  must(!g.CHECK.includes("người Việt"), `${g.id} CHECK hardcodes "người Việt"`);
}

// Danh sách chống lặp của mỗi thể loại phải có trần trong dedupeMemoryArrays, nếu không
// nó lớn mãi và được nhét nguyên vào MEMORY của mọi prompt về sau.
for (const g of [d, n])
  for (const k of g.usedMemoryKeys)
    must(MEMORY_CAPS[k] !== undefined,
      `${g.id} tracks ${k} in usedMemoryKeys but dedupeMemoryArrays has no cap for it — that list grows unbounded`);

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
