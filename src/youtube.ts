import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

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

export interface VideoSource { videoId: string; title: string; transcript: string }

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ code: number; stderr: string }> {
  return new Promise(resolve => {
    const p = spawn(cmd, args, { cwd, windowsHide: true });
    let stderr = "";
    p.stderr.on("data", d => { stderr += String(d); });
    p.stdout.on("data", () => {});
    const timer = setTimeout(() => p.kill(), timeoutMs);
    p.on("error", e => { clearTimeout(timer); resolve({ code: -1, stderr: String(e) }); });
    p.on("close", code => { clearTimeout(timer); resolve({ code: code ?? -1, stderr }); });
  });
}

export async function fetchVideo(url: string, pythonCommand: string): Promise<VideoSource> {
  const clean = url.trim();
  if (!isYoutubeUrl(clean)) throw Error("chỉ nhận link YouTube");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ytidea-"));
  try {
    // Một lượt gọi mạng duy nhất lấy cả phụ đề lẫn tiêu đề. Gọi riêng để lấy tiêu đề là
    // thêm một request nữa, mà YouTube trả 429 rất nhanh khi bị hỏi dồn.
    // --ignore-errors là bắt buộc chứ không phải cho chắc: xin nhiều ngôn ngữ thì YouTube
    // hay trả 429 ở ngôn ngữ thứ hai, và không có cờ này yt-dlp dừng ngay tại đó - lấy được
    // phụ đề tiếng Việt rồi nhưng chưa kịp ghi metadata, nên tiêu đề video về rỗng.
    const { code, stderr } = await run(pythonCommand, ["-m", "yt_dlp", "--skip-download",
      "--write-auto-sub", "--write-sub", "--sub-lang", "vi.*,en.*", "--sub-format", "vtt",
      "--write-info-json", "--no-warnings", "--ignore-errors", "-o", "%(id)s", "--", clean], dir, 180000);

    const files = await fs.readdir(dir);
    const subs = files.filter(f => f.endsWith(".vtt"));
    if (!subs.length) {
      // Mã thoát khác 0 chưa chắc là hỏng: yt-dlp có thể lấy được phụ đề tiếng Việt rồi
      // dính 429 ở tiếng Anh và vẫn thoát lỗi. Chỉ khi KHÔNG có file nào mới là thất bại.
      const why = /429|Too Many Requests/i.test(stderr) ? "YouTube đang chặn vì hỏi quá nhiều, thử lại sau vài phút"
        : /Private video|members-only|Sign in/i.test(stderr) ? "video ở chế độ riêng tư hoặc cần đăng nhập"
        : /Video unavailable/i.test(stderr) ? "video không tồn tại hoặc đã bị gỡ"
        : "video này không có phụ đề nào để đọc";
      throw Error(`${why} (yt-dlp thoát ${code})`);
    }
    // Ưu tiên tiếng Việt, và bản ".vi.vtt" trước bản ".vi-orig.vtt" khi có cả hai.
    const pick = subs.find(f => /\.vi\.vtt$/.test(f)) ?? subs.find(f => /\.vi[-.]/.test(f)) ?? subs.sort()[0];
    const transcript = parseVtt(await fs.readFile(path.join(dir, pick), "utf8"));
    if (transcript.length < 200) throw Error(`phụ đề quá ngắn để rút ra ý tưởng (${transcript.length} ký tự)`);

    const infoFile = files.find(f => f.endsWith(".info.json"));
    let title = "", videoId = "";
    if (infoFile) {
      const info = JSON.parse(await fs.readFile(path.join(dir, infoFile), "utf8").catch(() => "{}"));
      title = String(info?.title ?? "");
      videoId = String(info?.id ?? "");
    }
    return { videoId, title, transcript };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
