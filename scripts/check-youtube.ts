// Chạy: npx tsx scripts/check-youtube.ts   (ngoại tuyến, không gọi mạng, không tốn gì)
//
// Mẫu dưới đây do tôi tự viết nhưng theo ĐÚNG định dạng phụ đề tự động của YouTube quan sát
// được trên một video thật: kiểu cửa sổ trượt (mỗi khối lặp lại dòng trước rồi thêm dòng
// mới) và từng chữ bọc trong thẻ thời gian. Trên file thật, bộ phân tích này rút 502.594 ký
// tự VTT xuống 50.139 ký tự văn xuôi, không còn thẻ nào và không còn câu lặp liền kề nào
// trong 785 câu. Không chép nội dung video vào đây làm mẫu: định dạng mới là thứ cần test.
import { parseVtt, capTranscript, isYoutubeUrl, TRANSCRIPT_CAP, classifyYtdlp, explainYtdlp, joinAsrSegments } from "../src/youtube.js";

let failed = 0;
const must = (cond: boolean, msg: string) => { if (!cond) { console.error(`FAIL ${msg}`); failed++; } };

const VTT = `WEBVTT
Kind: captions
Language: vi

00:00:00.080 --> 00:00:01.750 align:start position:0%

Bà<00:00:00.359><c> ngồi</c><00:00:00.440><c> xuống</c><00:00:00.599><c> bên</c><00:00:00.719><c> hiên.</c>

00:00:01.750 --> 00:00:01.760 align:start position:0%
Bà ngồi xuống bên hiên.


00:00:01.760 --> 00:00:04.269 align:start position:0%
Bà ngồi xuống bên hiên.
Trời<00:00:02.520><c> chưa</c><00:00:02.800><c> sáng</c><00:00:03.040><c> hẳn.</c>

00:00:04.269 --> 00:00:04.279 align:start position:0%
Trời chưa sáng hẳn.


00:00:04.279 --> 00:00:05.710 align:start position:0%
Trời chưa sáng hẳn.
Con<00:00:04.480><c> chó</c><00:00:04.640><c> già</c><00:00:04.799><c> không</c><00:00:04.920><c> buồn</c><00:00:05.120><c> ngẩng</c><00:00:05.279><c> đầu.</c>
`;

const out = parseVtt(VTT);

// ── Cửa sổ trượt: mỗi câu đúng MỘT lần ────────────────────────────────────────
// Đây là khẳng định nặng nhất. Không bỏ trùng thì bản ghi phồng gấp đôi, và lượt trích ý
// tưởng đọc một văn bản mà mọi câu đều lặp — vừa tốn token vừa méo hẳn cái nó rút ra.
must(out === "Bà ngồi xuống bên hiên. Trời chưa sáng hẳn. Con chó già không buồn ngẩng đầu.",
  `rolling-window dedup produced: ${JSON.stringify(out)}`);
must((out.match(/Bà ngồi xuống bên hiên\./g) ?? []).length === 1, "a repeated caption line survived twice");

// ── Rác định dạng ─────────────────────────────────────────────────────────────
must(!/<[^>]*>/.test(out), "inline per-word timing tags were not stripped");
must(!out.includes("WEBVTT") && !out.includes("Kind:") && !out.includes("Language:"), "VTT header leaked into the transcript");
must(!out.includes("-->"), "a cue timing line leaked into the transcript");
must(parseVtt("WEBVTT\n\n") === "", "an empty VTT did not produce an empty transcript");
must(parseVtt("") === "", "an empty string threw or produced content");
must(parseVtt("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\ngi&#39;a đình &amp; con c&aacute;i") .includes("gi'a đình & con"),
  "HTML entities were not decoded");

// ── Cắt bản ghi: phải giữ CẢ đầu lẫn cuối ─────────────────────────────────────
// Cái kết nằm ở cuối bản ghi. Cắt cụt đuôi là vứt đúng nửa cần nhất để rút ra ý tưởng, và
// hỏng lặng lẽ: vẫn ra một ý tưởng nghe xuôi tai, chỉ là không có kết.
const long = "MO_DAU " + "x".repeat(TRANSCRIPT_CAP * 2) + " KET_THUC";
const capped = capTranscript(long);
must(capped.length <= TRANSCRIPT_CAP + 40, `capping overshot: ${capped.length} vs ${TRANSCRIPT_CAP}`);
must(capped.startsWith("MO_DAU"), "capping dropped the opening, where the premise lives");
must(capped.endsWith("KET_THUC"), "capping dropped the ending — the half an idea most needs");
must(capped.includes("lược bớt"), "capping did not mark that the middle was removed");
must(capTranscript("ngắn") === "ngắn", "a short transcript was altered");

// ── Chỉ nhận link YouTube ─────────────────────────────────────────────────────
for (const ok of ["https://www.youtube.com/watch?v=0vAvNT14Fkw", "https://youtu.be/0vAvNT14Fkw",
                  "https://m.youtube.com/watch?v=abc123", "https://www.youtube.com/shorts/abc123"])
  must(isYoutubeUrl(ok), `rejected a real YouTube URL: ${ok}`);
// Chuỗi mở đầu bằng "-" sẽ bị yt-dlp đọc thành tham số dòng lệnh, nên phải chặn ở cổng vào
// dù spawn đã truyền mảng đối số và có "--" ngăn cách.
for (const bad of ["-x", "--exec=calc.exe", "https://example.com/watch?v=1", "file:///etc/passwd",
                   "https://youtube.evil.com/watch?v=1", "not a url", ""])
  must(!isYoutubeUrl(bad), `accepted something that is not a YouTube link: ${JSON.stringify(bad)}`);

// -- Phan loai that bai cua yt-dlp -------------------------------------------
// Day la khang dinh nang nhat cua phan Whisper, va no la khang dinh AM: mot loi CAI DAT
// tuyet doi khong duoc bao thanh "video khong co phu de". Loi do da xay ra that - .venv
// khong co yt_dlp nen moi video deu bao la khong co phu de, va nguoi dung ket luan minh
// can Whisper trong khi thu can la mot lenh pip. Chan doan sai con te hon khong chan doan.
must(classifyYtdlp(1, "No module named yt_dlp") === "missing-tool", "a missing yt-dlp was not recognised as a broken install");
must(classifyYtdlp(-1, "spawn ENOENT") === "missing-tool", "a failed spawn was not recognised as a broken install");
must(classifyYtdlp(1, "ERROR: HTTP Error 429: Too Many Requests") === "blocked", "a 429 was not recognised as throttling");
must(classifyYtdlp(1, "ERROR: Private video. Sign in") === "private", "a private video was not recognised");
must(classifyYtdlp(1, "ERROR: Video unavailable") === "gone", "a removed video was not recognised");
// Chi ĐUNG nhanh nay duoc di tiep sang Whisper. Moi nhanh tren deu can chinh yt-dlp de tai
// audio ve, nen chay Whisper sau chung chi la that bai lan thu hai, cham hon.
must(classifyYtdlp(0, "") === "no-subs", "a clean run with no captions must be the only path to Whisper");
must(classifyYtdlp(1, "WARNING: no subtitles found") === "no-subs", "a plain no-subtitles run must reach Whisper");
must(explainYtdlp("missing-tool", "py.exe", 1).includes("pip install yt-dlp"), "the missing-tool message does not say how to fix it");
must(explainYtdlp("missing-tool", "py.exe", 1).includes("py.exe"), "the missing-tool message does not name the interpreter it tried");
must(!explainYtdlp("missing-tool", "py.exe", 1).includes("phu de"), "the missing-tool message still blames the video for having no captions");

// -- Noi cac doan Whisper ----------------------------------------------------
must(joinAsrSegments([" Ba ngoi xuong. ", "", "  Troi chua sang han. "]) === "Ba ngoi xuong. Troi chua sang han.",
  "ASR segments were not joined into clean prose");
must(joinAsrSegments([]) === "", "an empty segment list did not produce an empty transcript");

if (failed) { console.error(`\n${failed} youtube assertion(s) failed`); process.exit(1); }
console.log("youtube transcript parse/cap/url-guard OK");
