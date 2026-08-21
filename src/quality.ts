// Đo văn bằng số học thuần, không gọi LLM, không tốn gì. Tồn tại vì một lý do cụ thể:
// mọi câu lệnh trong prompt là một LỰC ĐẨY chứ không phải hàng rào, nên sửa lỗi theo một
// chiều gần như luôn đẩy văn rơi sang lỗi ở chiều ngược lại - và không ai thấy, vì chỉ có
// chiều đang sửa được nhìn. Bằng chứng: prompt HOOKFIX bản đầu bảo model "câu dài thì cắt
// đôi"; nó trả về văn dễ hiểu từng chữ nhưng cụt thành mảnh, tsc/snapshot/check đều xanh,
// và lỗi chỉ lộ ra khi người đọc bằng mắt.
//
// Chất lượng ở đây là một DẢI chứ không phải một hướng. Đo trên chính ba bản đã sinh ra:
//   bản gốc máy viết    26,7 chữ/câu, 1 câu 36 chữ     -> rối, câu lồng nhiều mệnh đề
//   bản chặt (luật cũ)  11,4 chữ/câu, 2 câu dưới 10 chữ -> vụn, đọc như gạch đầu dòng
//   bản mượt (luật mới) 16,2 chữ/câu, không câu nào lệch -> nằm giữa dải
// (Ba con số này do chính hàm dưới đây đếm. Bản nháp đầu tiên của tài liệu ghi 82/82 từ
//  vì đếm dấu gạch ngang "—" thành một từ - đúng loại sai mà module này sinh ra để chặn.)
export const SHORT_SENTENCE = 10, LONG_SENTENCE = 25, AVG_MIN = 12, AVG_MAX = 22, LENGTH_SLACK = 5;

// Cụm sáo rỗng và từ Hán-Việt văn vẻ mà chính HOOKFIX nêu đích danh phải bỏ. Danh sách
// này CỐ Ý ngắn và khớp chuỗi chính xác: nó chỉ chứng minh được cái nó liệt kê, và không
// bao giờ được đọc là "văn đã hết sáo".
const FLOURISH = ["trớ trêu thay", "ngậm ngùi", "xót xa thay", "dòng đời xô đẩy", "định mệnh", "cay đắng thay", "đau đớn thay"];
const HARD_WORDS = ["nghiệt ngã", "an bài", "cơ hàn", "thâm sâu", "phù du", "khắc khoải", "trầm luân", "oan nghiệt", "bi ai"];

// KHÔNG có bộ dò "câu thiếu chủ ngữ" ở đây, dù HOOKFIX có luật đòi đủ chủ ngữ. Tiếng Việt
// lược chủ ngữ hợp lệ rất thường xuyên, nên mọi bộ dò đều phải đoán, và một tín hiệu đoán
// sai còn tệ hơn không có tín hiệu: nó sẽ trả về bản gốc cho những bản sửa hoàn toàn tốt.
// Hai số đo dưới đây bắt đúng ca hỏng thật mà không phải đoán gì.

export interface ProseMetrics {
  words: number; sentences: number; avgSentence: number; minSentence: number; maxSentence: number;
  shortSentences: number; longSentences: number; flourish: string[]; hardWords: string[];
}

export const splitSentences = (text: string): string[] =>
  text.replace(/\s+/g, " ").trim().split(/(?<=[.!?…])\s+/).map(s => s.trim()).filter(Boolean);

// Dấu gạch ngang, dấu ngoặc kép đứng một mình không phải là chữ.
const countWords = (s: string): number => s.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;

export function measureProse(text: string): ProseMetrics {
  const sents = splitSentences(text), lens = sents.map(countWords).filter(n => n > 0);
  const low = text.toLowerCase();
  return {
    words: lens.reduce((a, b) => a + b, 0),
    sentences: lens.length,
    avgSentence: lens.length ? Math.round((lens.reduce((a, b) => a + b, 0) / lens.length) * 10) / 10 : 0,
    minSentence: lens.length ? Math.min(...lens) : 0,
    maxSentence: lens.length ? Math.max(...lens) : 0,
    shortSentences: lens.filter(n => n < SHORT_SENTENCE).length,
    longSentences: lens.filter(n => n > LONG_SENTENCE).length,
    flourish: FLOURISH.filter(w => low.includes(w)),
    hardWords: HARD_WORDS.filter(w => low.includes(w))
  };
}

export interface ProseVerdict { ok: boolean; regressions: string[]; gains: string[] }

// Số học chứng minh được bản sửa TỆ ĐI, không chứng minh được nó HAY HƠN - chữ đắt hơn,
// mạch liền hơn, thoại đúng giọng hơn đều nằm ngoài tầm đếm. Nên cổng này chỉ có một
// quyền: chặn cái đo được là tệ đi. `gains` chỉ để xếp hạng và để báo cáo, không phải
// điều kiện giữ, vì đòi phải có `gains` sẽ vứt bỏ đúng những cải thiện mà nó mù.
export function compareProse(before: ProseMetrics, after: ProseMetrics, opts: { maxWords?: number } = {}): ProseVerdict {
  const regressions: string[] = [], gains: string[] = [];
  // Trần độ dài phải so TƯƠNG ĐỐI như mọi luật khác, và phải có khe. Bản gốc do máy sinh
  // đã sát hoặc quá trần sẵn: chặn tuyệt đối thì mọi bản viết lại đều bị loại vì lỗi nó
  // không gây ra, kể cả bản mượt nhất. Chặn tương đối mà không có khe thì cũng hỏng theo
  // kiểu khác - bản mượt nhất đo được chỉ hơn bản gốc ĐÚNG MỘT TỪ và vẫn bị loại. Cổng này
  // phân xử chuyện phình văn, không phân xử chuyện lẻ một chữ; ép cắt cho đủ trần chính là
  // cách nhanh nhất đẩy model về lại văn cụt.
  if (opts.maxWords && after.words > opts.maxWords && after.words - before.words > LENGTH_SLACK)
    regressions.push(`phình quá trần: ${before.words} -> ${after.words} từ, tối đa ${opts.maxWords}`);
  if (after.shortSentences > before.shortSentences)
    regressions.push(`văn bị chặt vụn: ${after.shortSentences} câu dưới ${SHORT_SENTENCE} chữ (trước có ${before.shortSentences}), câu ngắn nhất ${after.minSentence} chữ`);
  if (after.longSentences > before.longSentences)
    regressions.push(`câu rối thêm: ${after.longSentences} câu quá ${LONG_SENTENCE} chữ (trước có ${before.longSentences}), câu dài nhất ${after.maxSentence} chữ`);
  if (after.avgSentence < AVG_MIN && after.avgSentence < before.avgSentence)
    regressions.push(`nhịp câu tụt còn ${after.avgSentence} chữ/câu (trước ${before.avgSentence}), dưới mức ${AVG_MIN} là đọc như gạch đầu dòng`);
  if (after.avgSentence > AVG_MAX && after.avgSentence > before.avgSentence)
    regressions.push(`nhịp câu phình lên ${after.avgSentence} chữ/câu (trước ${before.avgSentence}), trên mức ${AVG_MAX} là câu lồng nhiều mệnh đề`);
  const added = (a: string[], b: string[]) => b.filter(x => !a.includes(x));
  if (added(before.flourish, after.flourish).length)
    regressions.push(`thêm chữ sáo rỗng: ${added(before.flourish, after.flourish).join(", ")}`);
  if (added(before.hardWords, after.hardWords).length)
    regressions.push(`thêm từ Hán-Việt văn vẻ: ${added(before.hardWords, after.hardWords).join(", ")}`);

  if (after.longSentences < before.longSentences) gains.push(`gỡ được ${before.longSentences - after.longSentences} câu quá dài`);
  if (after.shortSentences < before.shortSentences) gains.push(`gộp được ${before.shortSentences - after.shortSentences} câu vụn`);
  if (added(after.flourish, before.flourish).length) gains.push(`bỏ chữ sáo rỗng: ${added(after.flourish, before.flourish).join(", ")}`);
  if (added(after.hardWords, before.hardWords).length) gains.push(`thay từ khó: ${added(after.hardWords, before.hardWords).join(", ")}`);
  const inBand = (m: ProseMetrics) => m.avgSentence >= AVG_MIN && m.avgSentence <= AVG_MAX;
  if (!inBand(before) && inBand(after)) gains.push(`nhịp câu về mức đọc được: ${before.avgSentence} -> ${after.avgSentence} chữ/câu`);
  if (opts.maxWords && before.words > opts.maxWords && after.words <= opts.maxWords) gains.push(`cắt vừa trần: ${before.words} -> ${after.words} từ`);

  return { ok: regressions.length === 0, regressions, gains };
}

// Biến đúng những con số vừa đo thành lời dặn cho lượt viết lại sau. Đây là chỗ vòng lặp
// thật sự khép: model lượt sau biết chính xác nó vừa hỏng ở đâu, thay vì nhận lại y
// nguyên cái prompt đã dẫn nó tới chỗ hỏng.
export function proseFeedback(verdict: ProseVerdict, before: ProseMetrics, after: ProseMetrics, maxWords?: number): string {
  if (verdict.ok) return "";
  const fixes: string[] = [];
  // Cùng điều kiện tương đối như compareProse, nếu không thì lời dặn sẽ đòi model sửa một
  // lỗi mà cổng không hề chặn - và đòi cắt chữ là cách nhanh nhất đẩy nó về văn cụt.
  if (maxWords && after.words > maxWords && after.words - before.words > LENGTH_SLACK)
    fixes.push(`Cắt xuống tối đa ${maxWords} từ (bản vừa rồi ${after.words} từ, bản gốc ${before.words} từ). Cắt chữ thừa, KHÔNG cắt tình tiết.`);
  if (after.shortSentences > 0) fixes.push(`Có ${after.shortSentences} câu dưới ${SHORT_SENTENCE} chữ. Gộp chúng vào câu liền kề bằng từ nối (rồi, mà, nhưng, vì, thế là), đừng để đứng lẻ.`);
  if (after.longSentences > 0) fixes.push(`Có ${after.longSentences} câu quá ${LONG_SENTENCE} chữ. Gỡ mệnh đề lồng nhau ra thành câu riêng ĐỦ chủ ngữ, đừng chặt giữa câu.`);
  if (after.avgSentence < AVG_MIN) fixes.push(`Cả đoạn trung bình ${after.avgSentence} chữ/câu, quá vụn. Nhắm khoảng ${AVG_MIN}-${AVG_MAX} chữ/câu.`);
  if (after.avgSentence > AVG_MAX) fixes.push(`Cả đoạn trung bình ${after.avgSentence} chữ/câu, quá rối. Nhắm khoảng ${AVG_MIN}-${AVG_MAX} chữ/câu.`);
  const words = [...after.flourish, ...after.hardWords];
  if (words.length) fixes.push(`Thay hoặc bỏ hẳn các từ này: ${words.join(", ")}.`);
  if (!fixes.length) return "";
  return `\nBẢN BẠN VIẾT LẦN TRƯỚC BỊ HỎNG ĐÚNG NHỮNG CHỖ NÀY, LẦN NÀY PHẢI SỬA:\n${fixes.map(f => `- ${f}`).join("\n")}\nMọi luật ở trên vẫn giữ nguyên.`;
}
