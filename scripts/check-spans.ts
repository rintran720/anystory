// Chạy: npx tsx scripts/check-spans.ts   (ngoại tuyến, không gọi LLM, không tốn gì)
//
// Sửa theo đoạn tồn tại để thu nhỏ bán kính nổ của một lượt sửa. Khẳng định nặng nhất ở
// đây là chuyện ghép lại: mọi ký tự NGOÀI các đoạn được thay phải còn nguyên từng byte.
// Nếu ghép sai thì chế độ này còn tệ hơn sửa cả chương - nó vừa đụng chỗ không được đụng,
// vừa báo cáo là "chỉ sửa một đoạn".
//
// Mẫu dưới đây dựng theo đúng hình dạng dữ liệu thật: đoạn ngắn, thoại nhiều, detail trích
// nguyên văn trong ngoặc cong. Trên review-report thật của output/thu-ngontinh (git-ignore
// nên không dùng làm mẫu cố định được), 5/5 lỗi trích nguyên văn và cả 5 đều định vị được.
import { paragraphsOf, quotesIn, locateIssues, spliceParagraphs, numberParagraphs, untouchedRatio } from "../src/spans.js";

const CHAPTER = [
  "Trời chưa sáng hẳn thì bà đã dậy.",
  "Bà mở nắp nồi, mùi cháo khét xộc lên. Nồi cháo bà nấu từ đêm qua đã cạn nước.",
  "— Mẹ để con nấu lại cho.",
  "Tôi ăn hết bát. Cháo hơi mặn, hơi khét.",
  "Ngoài sân, con chó già nằm dài dưới gốc khế, không buồn ngẩng đầu lên nhìn ai."
].join("\n\n");

let failed = 0;
const must = (cond: boolean, msg: string) => { if (!cond) { console.error(`FAIL ${msg}`); failed++; } };

// ── Cắt đoạn và offset ────────────────────────────────────────────────────────
const paras = paragraphsOf(CHAPTER);
must(paras.length === 5, `expected 5 paragraphs, got ${paras.length}`);
must(paras.every(p => CHAPTER.slice(p.start, p.end) === p.text), "paragraph offsets do not point at their own text");
must(paras[3].text === "Tôi ăn hết bát. Cháo hơi mặn, hơi khét.", `paragraph 3 mismatched: ${JSON.stringify(paras[3].text)}`);
must(paragraphsOf("").length === 0, "empty text produced paragraphs");
must(paragraphsOf("một dòng duy nhất").length === 1, "single-line text did not produce one paragraph");
// Xuống dòng đơn bên trong một đoạn không được cắt đoạn ra làm đôi.
must(paragraphsOf("dòng một\ndòng hai\n\ndòng ba").length === 2, "a single newline was treated as a paragraph break");

// ── Bóc cụm trích dẫn ─────────────────────────────────────────────────────────
must(quotesIn('Câu "Tôi ăn hết bát. Cháo hơi mặn, hơi khét." nghe cụt lủn.')[0] === "Tôi ăn hết bát. Cháo hơi mặn, hơi khét.", "straight quotes were not extracted");
must(quotesIn('Đoạn “Bà mở nắp nồi, mùi cháo khét xộc lên.” tả thừa.')[0] === "Bà mở nắp nồi, mùi cháo khét xộc lên.", "curly quotes were not extracted");
must(quotesIn('Chỗ "ngắn" không đủ dài để làm neo.').length === 0, "a too-short quote was accepted as an anchor — it can match the wrong paragraph");
must(quotesIn("Không có ngoặc kép nào ở đây cả.").length === 0, "a detail with no quotes produced an anchor");

// ── Định vị ───────────────────────────────────────────────────────────────────
const details = [
  'Câu "Tôi ăn hết bát. Cháo hơi mặn, hơi khét." bị chặt vụn, ba mệnh đề rời nhau.',
  'Đoạn “Bà mở nắp nồi, mùi cháo khét xộc lên.” lặp ý với câu sau.'
];
const located = locateIssues(CHAPTER, details);
must(located !== null, "both issues quote the chapter verbatim but neither located");
must(located?.[0].paragraph === 3, `issue 0 should land in paragraph 3, got ${located?.[0].paragraph}`);
must(located?.[1].paragraph === 1, `issue 1 should land in paragraph 1, got ${located?.[1].paragraph}`);

// Tất-cả-hoặc-không: một lỗi không định vị được thì cả lượt phải lùi về sửa cả chương.
// Sửa được 2/3 rồi im lặng bỏ lỡ lỗi thứ ba là báo cáo sai sự thật.
must(locateIssues(CHAPTER, [...details, 'Câu "một câu không hề có trong chương này" sai.']) === null,
  "one unlocatable issue did not force the whole pass back to full-chapter mode");
must(locateIssues(CHAPTER, ["Nhận xét chung chung không trích gì cả."]) === null,
  "an issue with no quoted evidence was treated as located");

// ── Ghép lại: khẳng định nặng nhất ────────────────────────────────────────────
const fixed = spliceParagraphs(CHAPTER, { 3: "Tôi ăn hết bát cháo, dù nó hơi mặn và hơi khét." });
must(fixed.includes("Tôi ăn hết bát cháo, dù nó hơi mặn và hơi khét."), "the replacement paragraph is missing from the result");
must(!fixed.includes("Tôi ăn hết bát. Cháo hơi mặn, hơi khét."), "the original paragraph survived alongside its replacement");
// Mọi đoạn KHÁC phải còn nguyên từng ký tự, và số đoạn không được đổi.
const after = paragraphsOf(fixed);
must(after.length === paras.length, `splice changed the paragraph count: ${paras.length} -> ${after.length}`);
for (const i of [0, 1, 2, 4])
  must(after[i].text === paras[i].text, `splice touched paragraph ${i}, which was not a target`);
// Ghép nhiều đoạn cùng lúc phải không lệch offset (thay từ phải sang trái).
const two = spliceParagraphs(CHAPTER, { 1: "Bà mở nắp nồi.", 3: "Tôi ăn hết bát cháo mặn." });
const twoParas = paragraphsOf(two);
must(twoParas[1].text === "Bà mở nắp nồi." && twoParas[3].text === "Tôi ăn hết bát cháo mặn.",
  `multi-paragraph splice landed wrong: ${JSON.stringify(twoParas.map(p => p.text))}`);
for (const i of [0, 2, 4]) must(twoParas[i].text === paras[i].text, `multi-splice touched untargeted paragraph ${i}`);
must(spliceParagraphs(CHAPTER, {}) === CHAPTER, "an empty replacement set did not return the text unchanged");
// Đoạn thay có khoảng trắng thừa hai đầu thì phải được cắt, không được đẩy vào giữa văn bản.
must(!spliceParagraphs(CHAPTER, { 3: "  Tôi ăn hết bát.  " }).includes("  Tôi ăn hết bát.  "), "replacement whitespace was not trimmed");

// ── Đánh dấu cho model ────────────────────────────────────────────────────────
const marked = numberParagraphs(CHAPTER, new Set([1, 3]));
must((marked.match(/<<<SỬA>>>/g) ?? []).length === 2, "the number of marked paragraphs does not match the targets");
must(marked.includes("<<<SỬA>>> [3] Tôi ăn hết bát."), "the target marker is not attached to its paragraph");
must(marked.includes("[0] Trời chưa sáng") && !marked.includes("<<<SỬA>>> [0]"), "an untargeted paragraph was marked");
must(paragraphsOf(CHAPTER).every(p => marked.includes(`[${p.index}] `)), "some paragraph was dropped from the numbered view");

// ── Thước đo bán kính nổ ──────────────────────────────────────────────────────
must(untouchedRatio(CHAPTER, CHAPTER) === 1, "identical text did not measure as fully untouched");
must(untouchedRatio(CHAPTER, fixed) === 0.8, `a one-paragraph edit of five should measure 0.8, got ${untouchedRatio(CHAPTER, fixed)}`);
const wholeRewrite = paras.map(p => p.text + " Thêm chữ.").join("\n\n");
must(untouchedRatio(CHAPTER, wholeRewrite) === 0, `a full rewrite should measure 0, got ${untouchedRatio(CHAPTER, wholeRewrite)}`);
// Đây là con số nói lên toàn bộ lý do của chế độ này: sửa theo đoạn giữ lại phần lớn
// chương, sửa cả chương thì không giữ được gì. Không cần LLM để biết điều đó.
must(untouchedRatio(CHAPTER, fixed) > untouchedRatio(CHAPTER, wholeRewrite),
  "span mode did not preserve more of the chapter than a full rewrite — the whole point is gone");

if (failed) { console.error(`\n${failed} span assertion(s) failed`); process.exit(1); }
console.log("paragraph-span locate/splice OK");
