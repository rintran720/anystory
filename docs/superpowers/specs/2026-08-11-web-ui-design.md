# Web UI cho Local Story Generator — Design

Date: 2026-08-11

## Mục tiêu

Hiện tại pipeline chỉ chạy qua CLI (`npm run dev -- <idea.txt>`, `npm run tts -- <output-dir>`). Mục tiêu là thêm một giao diện web local (`npm start`) để:
- Nhập idea (dán text hoặc chọn file có sẵn trong `stories/`) và cấu hình cơ bản, chạy pipeline sinh truyện.
- Xem tiến trình chạy dưới dạng progress bar có cấu trúc (chapter/scene/step hiện tại) kèm log chi tiết.
- Sau khi truyện xong, xem nội dung và kích hoạt bước TTS, xem tiến trình TTS, nghe/tải audio.
- Xem lại danh sách các truyện đã tạo trước đó và tiếp tục (resume) hoặc chạy TTS cho chúng.

CLI hiện tại (`npm run dev`, `npm run tts`) phải tiếp tục hoạt động y hệt — không phá vỡ workflow cũ.

## Kiến trúc tổng quan

```
Browser (HTML/CSS/JS tĩnh, không build step)
   │  fetch() cho action, EventSource (SSE) cho progress
   ▼
Express server (src/server.ts)
   │  gọi trực tiếp trong cùng process
   ▼
generateStory() (pipeline.ts) ──► Ollama (localhost:11434)
runTTS() (tts/index.ts, refactor thành hàm) ──► spawn python worker.py
```

- Server chạy tối đa 1 job sinh truyện và 1 job TTS cùng lúc (biến trạng thái in-memory, không cần queue/DB). Nếu có job đang chạy, request tạo job mới trả về `409`.
- `npm start` chạy `tsx src/server.ts`, lắng nghe cổng `PORT` (mặc định `4000`, theo cùng convention override qua env như các biến khác trong `config.ts`), in ra URL khi khởi động.
- `npm run dev` và `npm run tts` (CLI) giữ nguyên hành vi hiện tại.

## Backend — API surface

| Method | Path | Việc gì |
|---|---|---|
| `GET` | `/api/ideas` | Liệt kê file `*.txt` trong `stories/**` |
| `GET` | `/api/stories` | Liệt kê thư mục `output/*` kèm trạng thái tóm tắt (đang chạy / xong N/M chapter / có `final_story.txt` / có audio) |
| `GET` | `/api/stories/:name` | Chi tiết 1 story: bible, outline, danh sách chapter đã xong, có final story / audio chưa |
| `POST` | `/api/generate` | Body `{ name: string, idea: string, chapters?: number, scenesPerChapter?: number, durationMinutes?: number, model?: string }` (các field tuỳ chọn override `config.ts`, để trống/omit = dùng mặc định) → tạo/resume job sinh truyện. `409` nếu đã có job sinh truyện đang chạy |
| `POST` | `/api/generate/stop` | Đánh dấu abort job sinh truyện hiện tại; pipeline dừng ở checkpoint an toàn gần nhất (sau khi 1 scene/chapter hiện tại hoàn tất ghi cache) |
| `GET` | `/api/generate/stream` | SSE progress của job sinh truyện hiện tại; khi client connect giữa chừng, replay ngay trạng thái/log gần nhất trước khi tiếp tục stream |
| `POST` | `/api/tts/:name` | Chạy TTS cho 1 story đã có nội dung. `409` nếu đã có job TTS đang chạy |
| `GET` | `/api/tts/:name/stream` | SSE progress job TTS (parse dòng `[i/N] ...` từ stdout `worker.py`) |
| `GET` | `/output/:name/*` | Serve tĩnh file kết quả (`final_story.txt`, `chapter-*.txt`, `tts/audio/*.wav`) |

### Progress event model (job sinh truyện)

`generateStory(c, idea, out)` → `generateStory(c, idea, out, onProgress?)`. `onProgress` là callback tuỳ chọn, được gọi song song với các `console.log` đã có (không xoá log cũ, không đổi logic pipeline). Event:

```ts
type ProgressEvent =
  | { type: "bible" | "outline"; status: "start" | "cache" | "done" }
  | { type: "chapter"; chapter: number; total: number; title: string; status: "start" | "cache" | "done" }
  | { type: "scene"; chapter: number; scene: number; total: number; title: string; status: "planning" | "writing" | "memory" | "done" }
  | { type: "edit"; chapter: number; status: "start" | "done" }
  | { type: "error"; message: string }
  | { type: "complete" };
```

Server giữ event cuối + danh sách log gần nhất trong bộ nhớ cho job hiện tại, replay khi client mới connect vào stream.

### TTS

`src/tts/index.ts` refactor: logic hiện tại (đọc argv, tạo manifest, spawn worker) tách thành hàm `runTTS(storyDir, opts, onProgress?)` export được; khối cuối file giữ lại phần đọc `process.argv` và gọi `runTTS` để `npm run tts` chạy y hệt như trước. Server gọi `runTTS` trực tiếp, `spawn` dùng `stdio: "pipe"` thay vì `"inherit"` khi chạy từ server để parse từng dòng stdout (`[i/N] ...`) và tiếp tục in ra console server đồng thời (giữ log CLI khi chạy qua `npm run tts`).

## Frontend (tĩnh, không build step)

`public/index.html` + `app.js` + `style.css`, chuyển màn hình bằng JS thuần (không router/framework):

1. **Trang chủ** — bảng liệt kê `output/*` (tên, trạng thái, nút Tiếp tục / Xem / Chạy TTS) + nút "+ Tạo truyện mới".
2. **Form tạo truyện mới** — ô "Tên truyện" (bắt buộc, dùng làm `output/<tên>`); tab "Dán text" (textarea) hoặc "Chọn file có sẵn" (dropdown từ `/api/ideas`); form cấu hình cơ bản (số chương, số cảnh/chương, thời lượng, model — placeholder = giá trị mặc định từ `config.ts`, để trống = dùng mặc định); nút "Bắt đầu".
3. **Màn hình chạy/xem kết quả** — progress bar tổng (Chapter X/N + bước hiện tại: Bible/Outline/Plan-Write-Memory Scene Y/M/Editing), khung log cuộn chi tiết bên dưới, nút "Dừng" khi đang chạy. Khi có `final_story.txt`: nút "Xem truyện" (đọc full text tại chỗ) và "Chạy TTS". Khi chạy TTS: progress bar segment i/N riêng, xong thì hiện `<audio>` player theo từng file.

## Cấu trúc file mới

```
src/
  server.ts              # Express app, routes, job state, SSE
  pipeline.ts            # sửa: thêm tham số onProgress? tuỳ chọn
  tts/
    index.ts             # refactor: export runTTS(); giữ khối CLI cuối file
public/
  index.html
  app.js
  style.css
```

`package.json`: thêm script `"start": "tsx src/server.ts"`; thêm dependency `express` + devDependency `@types/express`.

## Error handling

- Lỗi ở stage critical (Bible/Outline/Chapter/Scene/Edit) sau 3 lần retry → pipeline throw như hiện tại; server bắt lỗi, phát `{type:"error", message}` qua SSE rồi kết thúc job. UI hiện banner lỗi với nút "Thử lại" (gọi lại `POST /api/generate` cùng `name` → tự resume từ chapter cache gần nhất theo cơ chế sẵn có của pipeline).
- Lỗi TTS (thiếu voice sample, worker.py lỗi) → tương tự, banner lỗi riêng trong khung TTS, không ảnh hưởng phần truyện đã có.
- `POST /api/generate` khi đã có job chạy → `409`; UI disable nút "Bắt đầu" và hiện tên job đang chạy.

## Kiểm thử / xác nhận thủ công

Không có test framework trong repo. Xác nhận bằng tay:
1. `npm start`, tạo truyện mới (idea ngắn, 2 chương/1 cảnh để chạy nhanh) → progress bar cập nhật đúng từng bước, khớp log console server.
2. Bấm "Dừng" giữa chừng → bấm "Tiếp tục" → xác nhận resume đúng (không sinh lại chapter đã xong).
3. Chạy TTS trên 1 truyện đã xong → progress bar theo segment, audio phát được.
4. Chạy song song `npm run dev` (CLI cũ) trên idea khác → xác nhận CLI vẫn hoạt động y hệt trước khi có server.
