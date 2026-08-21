// Chạy: npx tsx scripts/check-quality.ts   (ngoại tuyến, không gọi LLM, không tốn gì)
//
// Ba đoạn dưới đây KHÔNG phải mẫu bịa. Cả ba do chính pipeline này sinh ra trong một buổi
// làm việc, trên cùng một hook của output/thu-ngontinh, và chúng là ba trạng thái của cùng
// một lỗi: prompt sửa lỗi theo một chiều thì văn rơi sang lỗi ở chiều ngược lại.
//   ORIG   - bản HOOK máy viết ra: câu lồng nhiều mệnh đề, 26,7 chữ/câu, câu đầu 36 chữ
//   CHOPPY - sau khi HOOKFIX bảo "câu dài thì cắt đôi": dễ hiểu nhưng vụn, 11,4 chữ/câu
//   SMOOTH - sau khi đổi thành "viết lại cho gọn, đủ chủ ngữ": 16,2 chữ/câu
// Bài kiểm tra thật của module đo là nó phải LOẠI được CHOPPY khi đứng cạnh ORIG. Lúc lỗi
// đó xảy ra thật, tsc/snapshot/check-genre-prompts đều xanh và chỉ mắt người bắt được.
import { measureProse, compareProse, proseFeedback, AVG_MIN, AVG_MAX, LENGTH_SLACK } from "../src/quality.js";

const ORIG = "Tôi chưa bao giờ nghĩ mình sẽ mặc váy cưới đo theo số đo của chị gái, bước vào lễ đường in tên chị, cưới một người đàn ông chưa từng nhìn tôi quá một giây. Chị bỏ trốn ba ngày trước hôn lễ, cả nhà tráo tôi vào — đứa em giống chị tám phần. Tôi giấu tờ hợp đồng ba tháng dưới đáy vali, định đếm ngày rời đi — nhưng không ngày nào diễn ra như tôi chuẩn bị.";
const CHOPPY = "Tôi chưa từng nghĩ mình sẽ mặc váy cưới may theo số đo của chị gái. Bước vào lễ đường in tên chị. Cưới một người đàn ông chưa từng nhìn tôi quá một giây. Ba ngày trước hôn lễ, chị bỏ trốn. Cả nhà đẩy tôi vào thế chỗ, vì tôi giống chị tám phần. Tôi giấu tờ hợp đồng ba tháng dưới đáy vali, đếm ngày rời đi. Nhưng không ngày nào diễn ra như tôi chuẩn bị.";
const SMOOTH = "Tôi chưa bao giờ nghĩ mình sẽ mặc váy cưới đo theo số đo chị gái. Tôi bước vào lễ đường in tên chị, cưới người đàn ông chưa từng nhìn tôi quá một giây. Ba ngày trước hôn lễ, chị bỏ trốn, thế là cả nhà tráo tôi vào — đứa em giống chị tám phần. Tôi giấu tờ hợp đồng ba tháng dưới đáy vali, định đếm ngày rời đi. Nhưng không ngày nào diễn ra như tôi chuẩn bị.";

let failed = 0;
const must = (cond: boolean, msg: string) => { if (!cond) { console.error(`FAIL ${msg}`); failed++; } };

const orig = measureProse(ORIG), choppy = measureProse(CHOPPY), smooth = measureProse(SMOOTH);

// ── Số đo phải khớp với thực tế đã quan sát ────────────────────────────────────
must(orig.longSentences === 1, `ORIG should have 1 over-long sentence, measured ${orig.longSentences}`);
must(orig.maxSentence === 36, `ORIG opening sentence should measure 36 words, measured ${orig.maxSentence}`);
must(orig.shortSentences === 0, `ORIG should have no short sentences, measured ${orig.shortSentences}`);
must(orig.avgSentence > AVG_MAX, `ORIG should sit above the readable band, measured ${orig.avgSentence}`);

must(choppy.shortSentences === 2, `CHOPPY should have 2 sentences under 10 words, measured ${choppy.shortSentences}`);
must(choppy.longSentences === 0, `CHOPPY should have no over-long sentences, measured ${choppy.longSentences}`);
must(choppy.avgSentence < AVG_MIN, `CHOPPY should sit below the readable band, measured ${choppy.avgSentence}`);

must(smooth.shortSentences === 0 && smooth.longSentences === 0, `SMOOTH should have no outlier sentences, measured ${smooth.shortSentences} short / ${smooth.longSentences} long`);
must(smooth.avgSentence >= AVG_MIN && smooth.avgSentence <= AVG_MAX, `SMOOTH should sit inside the readable band, measured ${smooth.avgSentence}`);

// ── Cổng phải LOẠI đúng bản hỏng thật ──────────────────────────────────────────
// Đây là khẳng định quan trọng nhất của cả file: nếu nó xanh khi đáng đỏ thì toàn bộ vòng
// lặp là trang trí, và lỗi văn cụt sẽ lọt đúng như nó đã lọt một lần rồi.
const badFix = compareProse(orig, choppy, { maxWords: 80 });
must(!badFix.ok, "the choppy rewrite passed the gate — this is the exact defect that already shipped once");
must(badFix.regressions.some(r => r.includes("chặt vụn")), `choppy rewrite rejected, but not for being choppy: ${badFix.regressions.join(" | ")}`);

const goodFix = compareProse(orig, smooth, { maxWords: 80 });
must(goodFix.ok, `the smooth rewrite was rejected: ${goodFix.regressions.join(" | ")}`);
must(goodFix.gains.length > 0, "the smooth rewrite registered no measurable gain at all");
must(goodFix.gains.some(g => g.includes("câu quá dài")), `smooth rewrite should be credited with untangling long sentences: ${goodFix.gains.join(" | ")}`);

// Trần độ dài phải tương đối VÀ có khe. ORIG đúng 80 từ, SMOOTH 81 - bản viết lại chỉ hơn
// bản gốc một chữ. Chặn tuyệt đối hay chặn tương đối không khe đều loại đúng bản tốt nhất,
// rồi ép vòng lặp cắt chữ cho đủ trần, tức là đẩy văn thẳng về lại chỗ vụn.
must(orig.words === 80 && smooth.words === 81, `fixture drift: this assertion needs orig at the 80-word ceiling and smooth one word over (orig ${orig.words}, smooth ${smooth.words})`);
must(!goodFix.regressions.some(r => r.includes("trần")), "the length rule rejected the best rewrite over a single word — the gate is arbitrating rounding, not bloat");
const inflated = measureProse(SMOOTH + " Một câu dài được thêm vào đây để đẩy tổng số từ vượt hẳn lên trên mức trần cho phép của thể loại này.");
must(inflated.words - smooth.words > LENGTH_SLACK, `fixture drift: the inflated variant must exceed the slack (grew ${inflated.words - smooth.words})`);
must(compareProse(smooth, inflated, { maxWords: 80 }).regressions.some(r => r.includes("trần")),
  "a rewrite that genuinely inflates past the ceiling was not caught");

// ── Đi cả hai chiều ────────────────────────────────────────────────────────────
must(compareProse(smooth, choppy, { maxWords: 80 }).ok === false, "chopping a smooth hook passed the gate");
const repair = compareProse(choppy, smooth, { maxWords: 80 });
must(repair.ok, `repairing a choppy hook was rejected: ${repair.regressions.join(" | ")}`);
must(repair.gains.some(g => g.includes("câu vụn")), `repair should be credited with merging fragments: ${repair.gains.join(" | ")}`);

// ── Khe đếm phải co giãn theo độ dài ───────────────────────────────────────────
// Cùng một luật phải phục vụ hai cỡ văn bản khác nhau hàng chục lần. Không co giãn thì
// nó vừa quá chặt với chương (trả về bản gốc vì nhiễu vài câu) vừa đúng độ với lời dẫn.
const sentence = (n: number) => Array.from({ length: n }, (_, i) => `Người đàn bà ngồi xuống bên hiên và nhìn ra khoảng sân vắng lặng số ${i}.`).join(" ");
const fragment = (n: number) => Array.from({ length: n }, () => "Bà ngồi im.").join(" ");
const chapterBefore = measureProse(sentence(200));
must(chapterBefore.sentences === 200, `fixture drift: expected a 200-sentence chapter, measured ${chapterBefore.sentences}`);
must(compareProse(chapterBefore, measureProse(sentence(196) + " " + fragment(4))).ok,
  "a 200-sentence chapter was reverted over 4 short sentences — the gate is blocking noise");
must(!compareProse(chapterBefore, measureProse(sentence(170) + " " + fragment(30))).ok,
  "a chapter that gained 30 fragments passed the gate — the slack has swallowed a real regression");
// Khe của lời dẫn phải vẫn bằng 0, nếu không mẫu CHOPPY (0 -> 2 câu vụn) sẽ lọt.
must(Math.floor(orig.sentences / 25) === 0, `the hook-sized slack must stay 0, computed ${Math.floor(orig.sentences / 25)}`);

// ── Chữ sáo rỗng và từ Hán-Việt văn vẻ ─────────────────────────────────────────
const flowery = measureProse("Định mệnh nghiệt ngã đã an bài tất cả từ trước, trớ trêu thay cho một kiếp người mỏng manh.");
must(flowery.flourish.length >= 2 && flowery.hardWords.length >= 2, `flourish detector missed obvious clichés: ${JSON.stringify(flowery)}`);
must(compareProse(smooth, flowery).regressions.some(r => r.includes("sáo rỗng")), "a rewrite that added stock clichés passed the gate");
must(compareProse(flowery, smooth).gains.some(g => g.includes("sáo rỗng")), "removing stock clichés earned no credit");

// ── Lời dặn cho lượt sau phải nói ra con số, không nói chung chung ─────────────
const fb = proseFeedback(badFix, orig, choppy, 80);
must(fb.includes("dưới 10 chữ"), `feedback does not tell the model what actually broke: ${fb}`);
must(fb.includes("từ nối"), "feedback says what is wrong but not how to repair it");
must(proseFeedback(goodFix, orig, smooth, 80) === "", "feedback was produced for a rewrite that passed");

// ── Chuỗi rỗng không được làm đổ ───────────────────────────────────────────────
const empty = measureProse("");
must(empty.sentences === 0 && empty.avgSentence === 0, "empty text does not measure as empty");
must(compareProse(empty, smooth).ok, "measuring against empty text raised a false regression");

if (failed) { console.error(`\n${failed} quality-gate assertion(s) failed`); process.exit(1); }
console.log("prose quality gate OK (3 real fixtures, both directions)");
