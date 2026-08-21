// Định vị đoạn văn cần sửa, và ghép bản sửa trở lại nguyên vẹn.
//
// Lý do tồn tại: FIXCH đưa CẢ chương cho model rồi bảo "sửa 3 lỗi này", nên model có toàn
// quyền viết lại 2.000 chữ để chữa 3 câu. Đó không phải rủi ro phụ, đó là NGUỒN của chuyện
// "sửa lỗi sinh lỗi mới" - bán kính nổ bằng cả chương. Cổng đo trong quality.ts chỉ phát
// hiện sau khi đã nổ; thu hẹp phạm vi là ngăn nó nổ.
//
// Neo để định vị có sẵn và không phải đoán: REVIEW_CH đã bắt buộc mỗi issue.detail phải
// "trích một đoạn ngắn trong chương làm bằng chứng". Đo trên review-report thật của
// output/thu-ngontinh: 5/5 lỗi trích nguyên văn, cả 5 cụm đều tìm thấy đúng vị trí.

export interface Para { index: number; start: number; end: number; text: string }

// Đoạn = khối dòng liền nhau, ngăn bởi một dòng trống. Giữ offset để ghép lại theo vị trí
// chứ không ghép bằng cách nối chuỗi - nối chuỗi sẽ nuốt mất dấu phân cách gốc.
export function paragraphsOf(text: string): Para[] {
  const out: Para[] = [];
  const re = /[^\n]+(?:\n(?!\s*(?:\n|$))[^\n]+)*/g;
  let m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) out.push({ index: i++, start: m.index, end: m.index + m[0].length, text: m[0] });
  return out;
}

// Lấy các cụm đặt trong ngoặc kép của detail. Model dùng lẫn lộn ngoặc thẳng và ngoặc cong
// nên phải nhận cả hai. Ngưỡng 12 ký tự để loại những cụm quá ngắn - một cụm 4 chữ có thể
// khớp nhầm ở chỗ khác trong chương, và khớp nhầm nghĩa là sửa nhầm đoạn.
const MIN_QUOTE = 12;
export function quotesIn(detail: string): string[] {
  const out: string[] = [];
  for (const m of String(detail ?? "").matchAll(/["'“”'']([^"'“”'']{12,})["'“”'']/g)) out.push(m[1].trim());
  return out.filter(q => q.length >= MIN_QUOTE);
}

export interface Location { issue: number; paragraph: number; quote: string }

// Trả về vị trí của TỪNG lỗi, hoặc null nếu có bất kỳ lỗi nào không định vị được.
// Cố ý là tất-cả-hoặc-không: sửa được 2/3 lỗi theo đoạn rồi im lặng bỏ qua lỗi thứ ba là
// báo cáo sai sự thật. Không đủ neo thì lùi hẳn về sửa cả chương, và nói ra là đã lùi.
export function locateIssues(text: string, details: string[]): Location[] | null {
  const paras = paragraphsOf(text);
  if (!paras.length) return null;
  const found: Location[] = [];
  for (let i = 0; i < details.length; i++) {
    let hit: Location | null = null;
    for (const q of quotesIn(details[i])) {
      const at = text.indexOf(q);
      if (at < 0) continue;
      const p = paras.find(x => at >= x.start && at < x.end);
      if (p) { hit = { issue: i, paragraph: p.index, quote: q }; break; }
    }
    if (!hit) return null;
    found.push(hit);
  }
  return found;
}

// Ghép theo offset, từ phải sang trái, nên mọi ký tự ngoài các đoạn được thay đều còn
// nguyên xi - kể cả dấu phân cách, khoảng trắng thừa và xuống dòng trong đoạn.
export function spliceParagraphs(text: string, replacements: Record<number, string>): string {
  const paras = paragraphsOf(text);
  let out = text;
  for (const p of [...paras].reverse()) {
    const next = replacements[p.index];
    if (next == null) continue;
    out = out.slice(0, p.start) + next.trim() + out.slice(p.end);
  }
  return out;
}

// Đánh số đoạn cho model đọc, đánh dấu rõ đoạn nào phải sửa. Model nhận đủ ngữ cảnh cả
// chương nhưng chỉ được trả về các đoạn đã đánh dấu, nên bán kính nổ bị chặn ở ĐẦU RA.
export function numberParagraphs(text: string, targets: Set<number>): string {
  return paragraphsOf(text)
    .map(p => `${targets.has(p.index) ? "<<<SỬA>>> " : ""}[${p.index}] ${p.text}`)
    .join("\n\n");
}

// Tỉ lệ đoạn còn nguyên vẹn giữa hai bản. Đo được bán kính nổ mà không cần LLM: sửa theo
// đoạn thì con số này phải rất cao, sửa cả chương thì thấp. So được hai chế độ trên cùng
// một thước, nên nó vừa là kiểm chứng vừa là bằng chứng cho báo cáo.
export function untouchedRatio(before: string, after: string): number {
  const a = paragraphsOf(before).map(p => p.text.trim());
  if (!a.length) return 1;
  const b = new Set(paragraphsOf(after).map(p => p.text.trim()));
  return Math.round((a.filter(t => b.has(t)).length / a.length) * 1000) / 1000;
}
