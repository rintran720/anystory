// Đo KHUNG của một truyện audio bằng số học thuần, không gọi LLM. Anh em với quality.ts:
// quality.ts đo một đoạn văn, craft.ts đo cả một truyện.
//
// Lý do tồn tại: sáu tiêu chí trong REVIEW_CH/REVIEW_SUM đều do người viết prompt nghĩ ra,
// và một model chấm theo chúng chỉ đang lặp lại phán đoán đó. Dải dưới đây thì không — nó
// được đo từ bốn truyện của một kênh audio thật, tổng cộng ~32.000 từ, bằng chính các hàm
// trong file này. Số đo gốc nằm ở scripts/__fixtures__/craft-reference.json và check-craft.ts
// khẳng định dải này vẫn nhận cả bốn bản.
//
// Đo được cái gì thì đo, phần còn lại vẫn phải hỏi model. Cụ thể là ba nhóm dưới đây, và
// KHÔNG có nhóm thứ tư nào đoán mò: logic báo thù có thuyết phục không, bằng chứng có đắt
// không, kẻ ác có tự chuốc lấy không — những thứ đó nằm ngoài tầm đếm và thuộc về REVIEW_CH.
//
//   1. NHỊP CÂU     — chữ/câu, tỉ lệ câu quá ngắn và quá dài. Bốn bản chuẩn nằm gọn trong
//                     14,5-20,0 chữ/câu. Hai truyện pipeline đo được 8,2 và 28,4 — hỏng về
//                     HAI PHÍA NGƯỢC NHAU, nên một luật một chiều không bao giờ bắt được cả hai.
//   2. NGÔI KỂ      — cả bốn bản kể ở ngôi thứ nhất, 10,0-15,9% số câu mở thẳng bằng "Tôi ".
//                     Chỉ kiểm khi spine tự khai narration="first"; drama kể ngôi thứ ba
//                     một cách có chủ ý và không được coi đó là lỗi.
//   3. MẬT ĐỘ ĐỐI CHẤT — số dấu hỏi trên 1.000 từ. Bốn bản: 7,0-10,2. Pipeline: 1,5-5,2.
//                     Đây là cách rẻ nhất để đo "truyện có đang đối thoại hay đang tả".
// Dải = [min, max] đo được của bốn bản, nới ra 10% mỗi đầu rồi làm tròn. Nới vì bốn bản là
// một mẫu nhỏ, không phải vì con số nào nghe hợp lý hơn; check-craft.ts khẳng định dải đã
// nới vẫn nhận đủ bốn bản VÀ vẫn loại cả bốn truyện pipeline đã sinh ra.
//   bốn bản chuẩn: avg 14,5-20,0 | med 12-17 | ngắn 16,9-34,0% | dài 10,5-20,0% | "Tôi " 10,0-15,9% | ? 7,0-10,2
export const AVG_MIN = 13, AVG_MAX = 22, MEDIAN_MIN = 11, MEDIAN_MAX = 19;
export const SHORT_PCT_MIN = 15, SHORT_PCT_MAX = 38, LONG_PCT_MAX = 22;
export const FIRST_PERSON_PCT_MIN = 9, QUESTIONS_PER_1000_MIN = 6;
// Độ dài so TƯƠNG ĐỐI với mục tiêu của chính thể loại, không so với 8.000 từ của bốn bản:
// một spine khai 14.400 từ thì dài là ý đồ, không phải lỗi. Chỉ khung mới bị đo bằng dải.
export const WORDS_TOLERANCE = 0.2;

const SHORT_SENTENCE = 10, LONG_SENTENCE = 25;

// "Ba ngày sau", "Một năm sau" — cách bốn bản chuẩn nhảy qua hàng tháng trong một câu.
// Chỉ để báo cáo, không phải điều kiện đạt: ref-3 không dùng lần nào mà vẫn hay.
const TIME_JUMP = /\b(một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười|vài|\d+)\s*(giây|phút|giờ|ngày|tuần|tháng|năm)\s*sau\b/gi;

export interface CraftMetrics {
  words: number; sentences: number;
  avgSentence: number; medianSentence: number;
  shortPct: number; longPct: number;
  firstPersonPct: number; questionsPer1000: number; timeJumps: number;
}

export const splitSentences = (text: string): string[] =>
  text.replace(/\s+/g, " ").trim().split(/(?<=[.!?…])\s+/).map(s => s.trim()).filter(Boolean);

const countWords = (s: string): number => s.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
const pct = (n: number, total: number) => total ? Math.round((n / total) * 1000) / 10 : 0;
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), i = s.length >> 1;
  return s.length % 2 ? s[i] : Math.round(((s[i - 1] + s[i]) / 2) * 10) / 10;
};

export function measureCraft(text: string): CraftMetrics {
  const sents = splitSentences(text), lens = sents.map(countWords).filter(n => n > 0);
  const words = lens.reduce((a, b) => a + b, 0);
  // Chỉ đếm câu KỂ mở bằng "Tôi ", không đếm câu thoại: splitSentences giữ lại dấu ngoặc
  // kép mở đầu, nên `"Tôi không đi.` không khớp. Đó là chủ ý — thứ cần đo là giọng người
  // kể, không phải một nhân vật đang nói. Bản ghi lời của bốn bản chuẩn bị YouTube bóc mất
  // dấu ngoặc kép nên vài câu thoại vẫn lọt vào; sai số đó nhỏ hơn nhiều so với khoảng cách
  // giữa 10,0-15,9% (bốn bản ngôi thứ nhất) và 0,5-4,3% (truyện pipeline kể ngôi thứ ba),
  // nên tín hiệu vẫn dứt khoát.
  const firstPerson = sents.filter(s => s.startsWith("Tôi ")).length;
  return {
    words, sentences: lens.length,
    avgSentence: lens.length ? Math.round((words / lens.length) * 10) / 10 : 0,
    medianSentence: median(lens),
    shortPct: pct(lens.filter(n => n < SHORT_SENTENCE).length, lens.length),
    longPct: pct(lens.filter(n => n > LONG_SENTENCE).length, lens.length),
    firstPersonPct: pct(firstPerson, sents.length),
    questionsPer1000: words ? Math.round(((text.split("?").length - 1) / words) * 10000) / 10 : 0,
    timeJumps: (text.match(TIME_JUMP) ?? []).length
  };
}

export interface CraftTarget { words: number; narration: "first" | "third"; hookWords: number; outroWords: number }
export interface CraftVerdict { ok: boolean; violations: string[]; notes: string[] }

// Cổng này KHÔNG chặn gì cả và cố ý không được nối vào chỗ nào có quyền ghi đè file. Nó chỉ
// báo cáo. Số học chứng minh được truyện lệch khỏi dải của bốn bản đã bán được, nhưng không
// chứng minh được lệch là dở — một truyện hay ngoài dải vẫn là truyện hay, và tự động sửa
// theo số đo là cách nhanh nhất để có một truyện đúng dải mà không ai muốn nghe.
export function gradeCraft(m: CraftMetrics, t: CraftTarget,
                           hook?: CraftMetrics, outro?: CraftMetrics): CraftVerdict {
  const violations: string[] = [], notes: string[] = [];
  const lo = Math.round(t.words * (1 - WORDS_TOLERANCE)), hi = Math.round(t.words * (1 + WORDS_TOLERANCE));
  if (m.words < lo) violations.push(`truyện ngắn hơn mục tiêu: ${m.words} từ, thể loại nhắm ${t.words} (chấp nhận ${lo}-${hi})`);
  if (m.words > hi) violations.push(`truyện dài hơn mục tiêu: ${m.words} từ, thể loại nhắm ${t.words} (chấp nhận ${lo}-${hi})`);

  if (m.avgSentence < AVG_MIN)
    violations.push(`nhịp câu quá vụn: ${m.avgSentence} chữ/câu, dải chuẩn ${AVG_MIN}-${AVG_MAX} — nghe như đọc gạch đầu dòng`);
  if (m.avgSentence > AVG_MAX)
    violations.push(`nhịp câu quá rối: ${m.avgSentence} chữ/câu, dải chuẩn ${AVG_MIN}-${AVG_MAX} — người nghe không tua lại được`);
  if (m.medianSentence < MEDIAN_MIN || m.medianSentence > MEDIAN_MAX)
    violations.push(`câu trung vị ${m.medianSentence} chữ, dải chuẩn ${MEDIAN_MIN}-${MEDIAN_MAX}`);
  if (m.shortPct > SHORT_PCT_MAX)
    violations.push(`${m.shortPct}% câu dưới ${SHORT_SENTENCE} chữ, dải chuẩn tối đa ${SHORT_PCT_MAX}%`);
  if (m.shortPct < SHORT_PCT_MIN)
    violations.push(`chỉ ${m.shortPct}% câu dưới ${SHORT_SENTENCE} chữ, dải chuẩn tối thiểu ${SHORT_PCT_MIN}% — thiếu câu ngắn để nhấn`);
  if (m.longPct > LONG_PCT_MAX)
    violations.push(`${m.longPct}% câu quá ${LONG_SENTENCE} chữ, dải chuẩn tối đa ${LONG_PCT_MAX}%`);

  if (t.narration === "first" && m.firstPersonPct < FIRST_PERSON_PCT_MIN)
    violations.push(`chỉ ${m.firstPersonPct}% số câu mở bằng "Tôi ", dải chuẩn tối thiểu ${FIRST_PERSON_PCT_MIN}% — truyện đang trôi khỏi ngôi thứ nhất`);
  if (m.questionsPer1000 < QUESTIONS_PER_1000_MIN)
    violations.push(`chỉ ${m.questionsPer1000} dấu hỏi trên 1.000 từ, dải chuẩn tối thiểu ${QUESTIONS_PER_1000_MIN} — thiếu đối chất, truyện đang tả nhiều hơn nói`);

  // Lời dẫn và lời kết so với con số của CHÍNH thể loại, vì hai thứ đó là công thức riêng
  // của từng kênh: bốn bản chuẩn mở bằng 185-271 từ kể toẹt cốt truyện và đóng lại bằng
  // đúng một câu, còn drama mở 260 từ bằng tục ngữ và đóng 450 từ có lời kêu gọi bình luận.
  if (hook) {
    const cap = Math.round(t.hookWords * 1.15);
    if (hook.words > cap) violations.push(`lời dẫn ${hook.words} từ, thể loại nhắm ${t.hookWords} (trần ${cap})`);
    if (hook.words < Math.round(t.hookWords * 0.6)) violations.push(`lời dẫn chỉ ${hook.words} từ, thể loại nhắm ${t.hookWords}`);
  }
  if (outro) {
    const cap = Math.round(t.outroWords * 1.3);
    if (outro.words > cap) violations.push(`lời kết ${outro.words} từ, thể loại nhắm ${t.outroWords} (trần ${cap})`);
  }

  notes.push(`${m.words} từ ≈ ${Math.round(m.words / 240)} phút đọc`);
  notes.push(`${m.avgSentence} chữ/câu, trung vị ${m.medianSentence}, ${m.shortPct}% ngắn, ${m.longPct}% dài`);
  notes.push(`${m.firstPersonPct}% câu mở bằng "Tôi ", ${m.questionsPer1000} dấu hỏi/1.000 từ, ${m.timeJumps} lần nhảy thời gian`);
  return { ok: violations.length === 0, violations, notes };
}
