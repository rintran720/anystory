# Local Story Generator V5.1

`npm install`

`npm run dev -- .\stories\example\idea.txt`

Critical tasks retry tối đa 3 lần:
- Story Bible
- Outline
- Chapter Plan
- Scene Writing
- Chapter Editing

Attempt 1 dùng temperature cấu hình; attempt 2 = 0.2; attempt 3 = 0.1.

JSON được validate cả cú pháp lẫn các field quan trọng. Nếu tác vụ quan trọng vẫn fail sau 3 lần, chương trình dừng thay vì tạo story thiếu dữ liệu.

Memory cũng retry 3 lần nhưng không làm dừng story nếu thất bại.

Các file Story Bible, Outline và Chapter đã có sẽ được cache để chạy lại có thể resume.
