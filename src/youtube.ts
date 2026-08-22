import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Lấy phụ đề một video YouTube để rút ra Ý TƯỞNG, không phải để chép lời.
//
// Ranh giới nằm ở đây và phải giữ được bằng code chứ không bằng lời hứa: bản ghi lời chỉ
// có ĐÚNG MỘT người đọc là lượt gọi trích ý tưởng (prompt IDEA). Nó không bao giờ được ghi
// vào thư mục truyện, không bao giờ đi vào SC/WR/EDIT, nên các stage viết văn không có
// cách nào nhìn thấy câu chữ của video gốc. Cùng một cốt truyện thì hợp lệ; diễn đạt lại
// lời văn của người khác thì không, và đó cũng là thứ hệ thống bản quyền của YouTube bắt.

// Phụ đề tự động của YouTube dùng kiểu CỬA SỔ TRƯỢT: mỗi khối lặp lại nguyên dòng trước
// rồi thêm dòng mới, và từng chữ bọc trong thẻ thời gian <00:00:01.234><c> chữ </c>. Chép
// thẳng ra là được một bản ghi lặp gấp đôi, đầy rác thẻ. Lấy dòng CUỐI của mỗi khối rồi bỏ
// trùng liên tiếp thì dựng lại được đúng mạch lời.
export function parseVtt(vtt: string): string {
  const out: string[] = [];
  for (const block of vtt.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block.split("\n");
    if (/^WEBVTT/.test(lines[0] ?? "")) continue;
    let last = "";
    for (const raw of lines) {
      if (raw.includes("-->") || /^(Kind|Language|NOTE|STYLE):?/.test(raw)) continue;
      const text = raw
        .replace(/<[^>]*>/g, "")          // thẻ thời gian từng chữ và thẻ <c>
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
      if (text) last = text;
    }
    if (last && last !== out[out.length - 1]) out.push(last);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

// Bản ghi của một truyện dài vượt xa ngân sách token của một lượt gọi. Cắt kiểu ĐẦU + CUỐI
// chứ không cắt cụt phần đuôi: mở đầu chứa tiền đề, còn cái kết — thứ bắt buộc phải có để
// rút ra ý tưởng cho ra hồn — nằm ở cuối. Cắt cụt đuôi là vứt đúng nửa cần nhất.
export const TRANSCRIPT_CAP = 24000;
export function capTranscript(text: string, cap = TRANSCRIPT_CAP): string {
  if (text.length <= cap) return text;
  const head = Math.round(cap * 0.6), tail = cap - head;
  return `${text.slice(0, head)}\n\n[...lược bớt phần giữa...]\n\n${text.slice(-tail)}`;
}

// Chỉ nhận link YouTube, và chặn mọi chuỗi bắt đầu bằng "-" để không có gì bị yt-dlp đọc
// nhầm thành tham số dòng lệnh. spawn nhận mảng đối số nên không qua shell.
const YT_URL = /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com\/(watch\?|shorts\/|live\/)|youtu\.be\/)[\w\-?=&/.%]+$/i;
export const isYoutubeUrl = (url: string): boolean => YT_URL.test(url.trim()) && !url.trim().startsWith("-");

export type TranscriptSource = "captions" | "whisper";
export interface VideoSource { videoId: string; title: string; transcript: string; source: TranscriptSource }

// yt-dlp thoát khác 0 vì nhiều lý do hoàn toàn khác nhau, và gộp chúng lại là cách chẩn
// đoán sai. Bản đầu gộp thật: thiếu hẳn thư viện yt_dlp cũng báo "video này không có phụ
// đề", tức là đổ lỗi cho video vì một lỗi cài đặt. Chỉ ĐÚNG MỘT nhánh dưới đây được phép
// đi tiếp sang Whisper; mọi nhánh còn lại là hỏng thật và phải dừng, vì Whisper cũng cần
// chính yt-dlp để tải audio về.
export type YtFailure = "missing-tool" | "blocked" | "private" | "gone" | "no-subs";
export function classifyYtdlp(code: number, stderr: string): YtFailure {
  if (code === -1 || /No module named yt_dlp|ENOENT|not recognized/i.test(stderr)) return "missing-tool";
  if (/429|Too Many Requests|rate.?limit/i.test(stderr)) return "blocked";
  if (/Private video|members-only|Sign in|age.?restricted/i.test(stderr)) return "private";
  if (/Video unavailable|has been removed|does not exist/i.test(stderr)) return "gone";
  return "no-subs";
}
export function explainYtdlp(kind: Exclude<YtFailure, "no-subs">, python: string, code: number): string {
  if (kind === "missing-tool") return `chưa cài yt-dlp cho "${python}" — chạy: ${python} -m pip install yt-dlp`;
  if (kind === "blocked") return `YouTube đang chặn vì hỏi quá nhiều, thử lại sau vài phút (yt-dlp thoát ${code})`;
  if (kind === "private") return `video ở chế độ riêng tư hoặc cần đăng nhập (yt-dlp thoát ${code})`;
  return `video không tồn tại hoặc đã bị gỡ (yt-dlp thoát ${code})`;
}

function run(cmd: string, args: string[], cwd: string, timeoutMs: number, onStderr?: (line: string) => void): Promise<{ code: number; stderr: string }> {
  return new Promise(resolve => {
    const p = spawn(cmd, args, { cwd, windowsHide: true });
    let stderr = "", pending = "";
    p.stderr.on("data", d => {
      stderr += String(d);
      if (!onStderr) return;
      pending += String(d);
      const lines = pending.split(/\r?\n/); pending = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) onStderr(l.trim());
    });
    p.stdout.on("data", () => {});
    const timer = setTimeout(() => p.kill(), timeoutMs);
    p.on("error", e => { clearTimeout(timer); resolve({ code: -1, stderr: String(e) }); });
    p.on("close", code => { clearTimeout(timer); resolve({ code: code ?? -1, stderr }); });
  });
}

// Trần thời lượng cho đường Whisper. Không phải để tiết kiệm mà để một link dán nhầm
// (livestream 12 tiếng) không chiếm GPU cả buổi mà chẳng ai biết vì sao.
export const ASR_MAX_SECONDS = 4 * 3600;
const ASR_SCRIPT = fileURLToPath(new URL("./asr.py", import.meta.url));

// Whisper trả về từng đoạn rời; nối lại thành văn xuôi. Khác phụ đề tự động ở chỗ không có
// cửa sổ trượt nên không phải bỏ trùng - nhưng vẫn phải gom khoảng trắng, vì một đoạn rỗng
// hay một đoạn thừa dấu cách sẽ thành khoảng trống giữa câu.
export function joinAsrSegments(lines: string[]): string {
  return lines.map(l => l.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

async function transcribeWithWhisper(dir: string, url: string, python: string, durationSec: number,
                                     log: (s: string) => void): Promise<string> {
  if (durationSec > ASR_MAX_SECONDS)
    throw Error(`video dài ${Math.round(durationSec / 60)} phút, quá mức ${ASR_MAX_SECONDS / 3600} tiếng cho việc nghe bằng Whisper`);

  log(`[ASR] video không có phụ đề, tải audio về để nghe bằng Whisper`);
  const dl = await run(python, ["-m", "yt_dlp", "-f", "bestaudio/best", "--no-playlist",
    "--no-warnings", "-o", "audio.%(ext)s", "--", url], dir, 600000);
  const audio = (await fs.readdir(dir)).find(f => /^audio\./.test(f));
  if (!audio) {
    // Cùng bài học như trên: thông báo không nói lý do là thông báo vô dụng. Tải PHƯƠNG TIỆN
    // bị YouTube chặn theo kiểu khác hẳn tải phụ đề - phụ đề về được không có nghĩa là audio
    // về được, nên nhánh này phải tự phân loại lại chứ không thừa hưởng kết quả của lượt trước.
    const kind = classifyYtdlp(dl.code, dl.stderr);
    if (kind !== "no-subs") throw Error(explainYtdlp(kind, python, dl.code));
    const why = dl.stderr.trim().split(/\r?\n/).filter(l => /ERROR/i.test(l)).slice(-1)[0]
      ?? dl.stderr.trim().split(/\r?\n/).slice(-1)[0] ?? "";
    throw Error(`không tải được audio của video (yt-dlp thoát ${dl.code})${why ? ": " + why : ""}`);
  }

  // Rộng tay: 2x thời lượng thật, tối thiểu 15 phút, tối đa 2 tiếng. Trên GPU turbo chạy
  // nhanh hơn nhiều lần realtime; trần này là để một máy CPU-only không bị cắt giữa chừng.
  const timeout = Math.min(7200000, Math.max(900000, Math.round(durationSec * 2000)));
  const asr = await run(python, [ASR_SCRIPT, "--audio", path.join(dir, audio),
    "--out", path.join(dir, "asr.txt")], dir, timeout, line => log(line));
  if (asr.code === 3) throw Error(`chưa cài faster-whisper cho "${python}" — chạy: ${python} -m pip install faster-whisper`);
  if (asr.code !== 0) throw Error(`Whisper nghe không xong (thoát ${asr.code}): ${asr.stderr.trim().split(/\r?\n/).slice(-2).join(" ")}`);

  return joinAsrSegments((await fs.readFile(path.join(dir, "asr.txt"), "utf8")).split("\n"));
}

export async function fetchVideo(url: string, python: string,
                                 log: (s: string) => void = m => console.log(m)): Promise<VideoSource> {
  const clean = url.trim();
  if (!isYoutubeUrl(clean)) throw Error("chỉ nhận link YouTube");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ytidea-"));
  try {
    // Một lượt gọi mạng duy nhất lấy cả phụ đề lẫn tiêu đề. Gọi riêng để lấy tiêu đề là
    // thêm một request nữa, mà YouTube trả 429 rất nhanh khi bị hỏi dồn.
    // --ignore-errors là bắt buộc chứ không phải cho chắc: xin nhiều ngôn ngữ thì YouTube
    // hay trả 429 ở ngôn ngữ thứ hai, và không có cờ này yt-dlp dừng ngay tại đó - lấy được
    // phụ đề tiếng Việt rồi nhưng chưa kịp ghi metadata, nên tiêu đề video về rỗng.
    // --no-playlist vì một link dạng watch?v=X&list=Y sẽ kéo phụ đề của CẢ playlist về.
    const { code, stderr } = await run(python, ["-m", "yt_dlp", "--skip-download",
      "--write-auto-sub", "--write-sub", "--sub-lang", "vi.*,en.*", "--sub-format", "vtt",
      "--write-info-json", "--no-warnings", "--ignore-errors", "--no-playlist",
      "-o", "%(id)s", "--", clean], dir, 180000);

    const files = await fs.readdir(dir);
    const infoFile = files.find(f => f.endsWith(".info.json"));
    let title = "", videoId = "", duration = 0;
    if (infoFile) {
      const info = JSON.parse(await fs.readFile(path.join(dir, infoFile), "utf8").catch(() => "{}"));
      title = String(info?.title ?? "");
      videoId = String(info?.id ?? "");
      duration = Number(info?.duration ?? 0);
    }

    // Mã thoát khác 0 chưa chắc là hỏng: yt-dlp có thể lấy được phụ đề tiếng Việt rồi
    // dính 429 ở tiếng Anh và vẫn thoát lỗi. Chỉ khi KHÔNG có file nào mới phải phân loại.
    const subs = files.filter(f => f.endsWith(".vtt"));
    let transcript: string, source: TranscriptSource;
    if (subs.length) {
      // Ưu tiên tiếng Việt, và bản ".vi.vtt" trước bản ".vi-orig.vtt" khi có cả hai.
      const pick = subs.find(f => /\.vi\.vtt$/.test(f)) ?? subs.find(f => /\.vi[-.]/.test(f)) ?? subs.sort()[0];
      transcript = parseVtt(await fs.readFile(path.join(dir, pick), "utf8"));
      source = "captions";
    } else {
      const kind = classifyYtdlp(code, stderr);
      if (kind !== "no-subs") throw Error(explainYtdlp(kind, python, code));
      transcript = await transcribeWithWhisper(dir, clean, python, duration, log);
      source = "whisper";
    }
    if (transcript.length < 200)
      throw Error(`bản ghi lời quá ngắn để rút ra ý tưởng (${transcript.length} ký tự, nguồn ${source})`);

    return { videoId, title, transcript, source };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
