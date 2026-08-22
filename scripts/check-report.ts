// Chạy: npx tsx scripts/check-report.ts   (ngoại tuyến, không gọi LLM, không tốn gì)
//
// Mẫu dưới đây là dữ liệu THẬT, chép nguyên từ review-report.json của output/thu-ngontinh:
// truyện có chương 1,2,3 nhưng REVIEW_SUM trả về chapters=[0],[1],[2],[2],[2] - chỉ số mảng
// 0-based thay vì số chương. Bằng chứng nó lệch chứ không phải cách đánh số khác: mục gắn
// [0] có detail ghi "Cliffhanger ở chương 1", còn mục gắn [2] tả cảnh đối đầu ở chương 3.
import { badTopChapters, sanitizeTopChapters } from "../src/report.js";

let failed = 0;
const must = (cond: boolean, msg: string) => { if (!cond) { console.error(`FAIL ${msg}`); failed++; } };
const real = new Set([1, 2, 3]);
const observed = () => ({ topIssues: [
  { severity: "thấp", chapters: [0], detail: "Cliffhanger ở chương 1 dừng lại ở tin nhắn thoại." },
  { severity: "vừa", chapters: [1], detail: "Đoạn mô tả cảnh đối thoại bị lặp cấu trúc câu." },
  { severity: "vừa", chapters: [2], detail: "Câu thoại của nam chính lúc đối đầu bị sáo rỗng." }
] });

// ── Phát hiện ─────────────────────────────────────────────────────────────────
must(badTopChapters(observed(), real).includes(0), "chapter 0 was not flagged — no story has a chapter 0");
must(badTopChapters({ topIssues: [{ chapters: [1, 2, 3] }] }, real).length === 0, "valid chapter numbers were flagged as bad");
must(badTopChapters({ topIssues: [{ chapters: [] }] }, real).length === 0, "an empty chapter list was flagged");
must(badTopChapters({ topIssues: [{ detail: "không có chapters" }] }, real).length === 0, "a missing chapter list was flagged");
must(badTopChapters(null, real).length === 0, "a null summary threw or flagged");
must(badTopChapters({ topIssues: [{ chapters: [4] }] }, real).includes(4), "an out-of-range chapter above the real range was not flagged");

// ── Dọn: bỏ số không có thật, KHÔNG đoán ──────────────────────────────────────
const cleaned = sanitizeTopChapters(observed(), real);
must(cleaned.topIssues[0].chapters.length === 0, "chapter 0 survived sanitising");
must(cleaned.topIssues[1].chapters.join() === "1" && cleaned.topIssues[2].chapters.join() === "2",
  `sanitising dropped valid numbers: ${JSON.stringify(cleaned.topIssues.map((t: any) => t.chapters))}`);
// Khẳng định quan trọng nhất của file này. Cộng 1 cho cả loạt sẽ "chữa" đúng phần lớn thời
// gian, và chính vì đúng phần lớn thời gian nên nó nguy hiểm: khi sai, nó gắn một số chương
// SAI lên một lỗi và không ai biết. Bỏ số đi thì người đọc thấy ngay là thiếu.
must(cleaned.topIssues[0].chapters.join() !== "1", "sanitising guessed 0 -> 1 instead of dropping it; a wrong chapter number is worse than none");
must(cleaned.topIssues[2].chapters.join() !== "3", "sanitising shifted a whole list by one — that is a guess, not a repair");
// Phần chữ của lỗi không được đụng vào; chỉ con số bị bỏ.
must(cleaned.topIssues[0].detail.includes("chương 1"), "sanitising rewrote the issue text as well as its chapter list");

// ── Không đổ với dữ liệu méo ──────────────────────────────────────────────────
must(sanitizeTopChapters({}, real) !== undefined, "sanitising an empty summary returned nothing");
must(sanitizeTopChapters({ topIssues: [{ chapters: "2" }] }, real).topIssues[0].chapters === "2", "a non-array chapters field was mangled instead of left alone");

if (failed) { console.error(`\n${failed} report assertion(s) failed`); process.exit(1); }
console.log("review-report chapter-number guard OK (real 0-based sample)");
