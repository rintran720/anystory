// Kiểm tra hình dạng của báo cáo review. Tách riêng để test được mà không phải nạp cả
// pipeline (kéo theo config, ollama và biến môi trường).
//
// REVIEW_SUM gắn "chapters" cho mỗi topIssue, và model thỉnh thoảng ghi CHỈ SỐ MẢNG 0-based
// thay vì số chương thật - bảng điểm truyền vào là một mảng nên phần tử đầu là chương 1.
// Quan sát thật trên một truyện 3 chương: chapters=[0],[1],[2],[2],[2] trong khi detail của
// chính mục đầu ghi "Cliffhanger ở chương 1", và mục gắn [2] lại tả cảnh đối đầu ở chương 3.
// Lệch đúng một đơn vị, và lệch LẶNG LẼ: JSON vẫn hợp lệ, màn hình vẫn đẹp, chỉ là chỉ sai
// chương. Lỗi lúc có lúc không - cùng prompt, lượt trước trả về [1,2,3] đúng - nên sửa
// prompt là cần nhưng không đủ.
export const badTopChapters = (summary: any, valid: Set<number>): number[] =>
  ((summary?.topIssues ?? []) as any[])
    .flatMap(t => (t?.chapters ?? []) as any[])
    .map(Number)
    .filter(n => !valid.has(n));

// KHÔNG tự cộng 1 để "chữa" cho thành 1-based. Suy đoán đó đúng phần lớn thời gian, nhưng
// khi sai thì nó gắn một số chương SAI lên một lỗi - và một số chương sai còn tệ hơn không
// có số nào, đúng lý lẽ đã dùng cho nhãn "cũ" của điểm lỗi thời. Bỏ hẳn số không có thật.
export function sanitizeTopChapters(summary: any, valid: Set<number>): any {
  for (const t of (summary?.topIssues ?? []) as any[])
    if (Array.isArray(t?.chapters)) t.chapters = t.chapters.map(Number).filter((n: number) => valid.has(n));
  return summary;
}
