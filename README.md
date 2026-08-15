# Local Story Generator V5.1

`npm install`

`npm run dev -- .\stories\example\idea.txt`

`npm start` — chạy giao diện web tại http://localhost:4000 (đổi cổng bằng biến môi trường `PORT`) để nhập idea, xem tiến trình sinh truyện theo thời gian thực, xem truyện đã xong, và chạy TTS — không cần dùng CLI.

Critical tasks retry tối đa 3 lần:
- Story Bible
- Outline
- Chapter Plan
- Scene Writing
- Chapter Editing

Với các tác vụ trả JSON (Story Bible, Outline, Chapter Plan): attempt 1 dùng temperature cấu hình; attempt 2 = 0.2; attempt 3 = 0.1 — hạ dần để model bám đúng định dạng JSON.

Với các tác vụ trả văn bản truyện (Scene Writing, Chapter Editing): giữ nguyên temperature cấu hình ở cả 3 lần. Các lỗi ở đây (lỗi mạng/API, response rỗng, tràn `max_tokens`) không phải do temperature cao, mà hạ temperature khi viết văn dài lại đẩy model về decoding gần-greedy và dễ sinh lặp chữ.

JSON được validate cả cú pháp lẫn các field quan trọng. Nếu tác vụ quan trọng vẫn fail sau 3 lần, chương trình dừng thay vì tạo story thiếu dữ liệu.

Memory cũng retry 3 lần nhưng không làm dừng story nếu thất bại.

Các file Story Bible, Outline và Chapter đã có sẽ được cache để chạy lại có thể resume.
