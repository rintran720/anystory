# DeepSeek làm LLM provider thay thế — Design

Date: 2026-08-11

## Mục tiêu

Hiện tại pipeline sinh truyện chỉ gọi Ollama local (`localhost:11434`). Mục tiêu là thêm DeepSeek (API cloud, OpenAI-compatible) làm provider thay thế cho toàn bộ các lệnh gọi LLM trong pipeline sinh truyện (Story Bible, Outline, Scene Plan, Scene Writing, Memory, Chapter Editing) — **không áp dụng cho TTS** (TTS là worker Python riêng, không liên quan).

Yêu cầu cụ thể (đã thống nhất qua brainstorming):
- Chọn provider (Ollama hoặc DeepSeek) **một lần duy nhất** trên một trang Cài đặt riêng của web UI, áp dụng cho mọi lần sinh truyện sau đó — không chọn lại mỗi lần tạo truyện.
- Cấu hình được lưu vào file trên đĩa (`settings.json`, git-ignored) để giữ nguyên qua các lần restart server.
- Áp dụng cho **cả CLI (`npm run dev`) lẫn web UI (`npm start`)** — settings.json là nguồn cấu hình chung, không cần cấu hình 2 nơi riêng biệt.
- Khi chưa từng lưu `settings.json`, hành vi mặc định y hệt hiện tại (provider Ollama, không có gì thay đổi).

## Xác nhận API DeepSeek (tra cứu trực tiếp, không dùng kiến thức cũ)

- Base URL: `https://api.deepseek.com`, endpoint `POST /chat/completions` (OpenAI-compatible).
- Auth: header `Authorization: Bearer <API_KEY>`.
- Model hiện có: `deepseek-v4-flash`, `deepseek-v4-pro`.
- JSON mode: `response_format:{type:"json_object"}` — DeepSeek yêu cầu tự chỉ thị model xuất JSON trong nội dung prompt/system message. Các prompt hiện tại trong `src/prompts.ts` đã tự yêu cầu model xuất JSON thuần (theo mô tả kiến trúc trong CLAUDE.md), nên **không cần sửa prompt**.
- Response: `choices[0].message.content` (khác với Ollama's `message.content`).

## Kiến trúc

### Lưu cấu hình (`settings.json`)

File JSON ở thư mục gốc repo, thêm vào `.gitignore`:
```json
{
  "provider": "ollama",
  "ollamaModel": "qwen3.5:9b",
  "deepseekApiKey": "",
  "deepseekModel": "deepseek-v4-flash"
}
```

`src/config.ts` giữ nguyên object `config` tĩnh hiện có (default từ env var, không đổi), thêm một hàm `loadSettingsOverrides(): Partial<Config>` đọc `settings.json` nếu tồn tại (try/catch, trả `{}` nếu file không có/lỗi parse) và trả về các field cần override. Cả `src/index.ts` (CLI) và `src/server.ts` (web) đều gọi hàm này để tính config hiệu lực (`{...config, ...loadSettingsOverrides()}`) mỗi khi bắt đầu một lần sinh truyện — đảm bảo luôn đọc giá trị mới nhất, không cần cache/restart.

Mapping tên field: `settings.json`'s `ollamaModel` → ghi đè `Config.model` (field `model` đã tồn tại từ trước, vẫn là "tên model Ollama" như hiện tại, không đổi ý nghĩa); `settings.json`'s `deepseekApiKey`/`deepseekModel` → ghi đè nguyên object `Config.deepseek`. Vì `settings.json` luôn chứa đủ cả 4 field cùng nhau (không phải partial rời rạc), override là gán thẳng, không cần deep-merge.

### Kiểu dữ liệu (`src/types.ts`, dense style — khớp quy ước file hiện có)

`Config` thêm 2 field:
```ts
provider:"ollama"|"deepseek";
deepseek:{apiKey:string;model:string};
```

### Gọi LLM đa provider (`src/ollama.ts`)

Chỉ sửa `askLLM()` — thêm rẽ nhánh đầu hàm: nếu `c.provider==="deepseek"` thì gọi hàm nội bộ mới `askDeepSeek(c,p,o)` (endpoint/header/response-parsing như mô tả ở trên); nếu thiếu `c.deepseek.apiKey` thì throw lỗi rõ ràng ngay trước khi gọi fetch. Nhánh Ollama hiện có giữ nguyên 100% không đổi. `askJSON`, `retryLLM`, `validateOutline`, `validateScenePlan`, `extractJSON` không đổi — chúng chỉ gọi `askLLM` nên tự động hoạt động với cả 2 provider.

### API endpoints mới (`src/server.ts`)

| Method | Path | Việc gì |
|---|---|---|
| `GET` | `/api/settings` | Trả `{provider, ollamaModel, deepseekModel, deepseekApiKeySet:boolean}` — **không bao giờ trả API key thật**, chỉ báo đã lưu key hay chưa |
| `POST` | `/api/settings` | Body `{provider, ollamaModel, deepseekModel, deepseekApiKey?}` — ghi `settings.json`. `deepseekApiKey` bỏ trống/omit = giữ nguyên key cũ đã lưu; có giá trị mới = ghi đè |

`POST /api/generate` tính `jobConfig` bằng cách merge `loadSettingsOverrides()` vào config trước khi gọi `generateStory` (thay vì chỉ dùng `config` từ `config.ts` như hiện tại).

### Frontend

- Trang chủ (`public/index.html`): thêm nút "⚙️ Cài đặt" cạnh "+ Tạo truyện mới".
- Màn hình mới `#view-settings`: chọn provider (radio/select Ollama/DeepSeek), hiện đúng nhóm trường theo lựa chọn:
  - Ollama: ô tên model (text).
  - DeepSeek: ô API key (`type="password"`, placeholder "•••• đã lưu" nếu `deepseekApiKeySet:true`, để trống khi lưu = giữ key cũ), dropdown model (`deepseek-v4-flash`/`deepseek-v4-pro`).
  - Nút "Lưu" → `POST /api/settings`, hiện thông báo thành công/lỗi.
- Form "Tạo truyện mới": **bỏ ô "Model Ollama"** hiện có (`field-model`) — model giờ cấu hình một lần ở trang Cài đặt, không còn override theo từng truyện. `POST /api/generate` không còn gửi field `model` trong body.

## Error handling

- Provider DeepSeek nhưng chưa cấu hình API key → `askLLM` throw lỗi tiếng Việt rõ ràng ("Chưa cấu hình DeepSeek API key. Vào Cài đặt để nhập.") trước khi gọi fetch — lỗi này chảy qua cơ chế retry/error-event SSE hiện có (Story Bible/Outline/Scene/Edit đều là stage "critical", vẫn dừng job sau 3 lần thử như thiết kế gốc).
- Lỗi HTTP từ DeepSeek (401 sai key, 429 rate limit...) hiển thị nguyên văn qua cùng cơ chế lỗi hiện có, không cần xử lý đặc biệt.
- `settings.json` lỗi parse hoặc không tồn tại → coi như chưa cấu hình gì, dùng default Ollama như hiện tại (không throw, không chặn khởi động).

## Bảo mật

- `settings.json` thêm vào `.gitignore` — API key không bao giờ vào git.
- `GET /api/settings` không echo key thật ra frontend dưới bất kỳ hình thức nào (kể cả một phần) — chỉ boolean `deepseekApiKeySet`.
- Key được truyền qua HTTPS tới DeepSeek (chuẩn), không log ra console/log file.

## Kiểm thử / xác nhận

Không có test framework trong repo (theo CLAUDE.md). Xác nhận bằng tay:
1. `npx tsc --noEmit` sạch.
2. Hồi quy Ollama: với `settings.json` không tồn tại (hoặc `provider:"ollama"`), chạy lại ví dụ có sẵn `output/idea` (cache toàn bộ, không tốn phí) qua cả CLI lẫn web UI — xác nhận hành vi y hệt trước khi có tính năng này.
3. DeepSeek thật: người dùng cung cấp API key thật (tạm thời) để test — lưu qua trang Cài đặt, tạo một truyện mới ngắn (1 chương/1 cảnh) để xác nhận request/response thực sự hoạt động, JSON parse đúng, xuất ra story thật.
4. Xác nhận API key không xuất hiện trong git diff/log/bất kỳ file commit nào.
