# Playbook kể chuyện — rút từ 3 video kênh truyện đêm khuya

Tài liệu này ghi lại các kỹ thuật giữ chân người nghe học được từ ba video tham khảo, và
chỉ rõ mỗi kỹ thuật đã được mã hoá vào prompt nào trong [src/prompts.ts](../src/prompts.ts).
Mục đích: khi sửa prompt về sau, biết được câu chữ nào đang phục vụ mục tiêu gì.

## Nguồn

| Video | Kênh | Dài | Views | Ghi chú |
|---|---|---|---|---|
| [PHÚC ĐỨC TẠI MẪU](https://www.youtube.com/watch?v=Bg3P26w2pVY) | CHUYỆN ĐỜI AUDIO | 106 phút | 383k | Giọng kể toàn tri, nhiều lời bình của người kể |
| [NÓ TƯỞNG TÔI NGU](https://www.youtube.com/watch?v=mFiMimhtojQ) | CHUYỆN ĐỜI AUDIO | 102 phút | 124k | Nghề nhất trong ba bản. Hầu hết kỹ thuật dưới đây lấy từ đây |
| [Tôi Lên Ở Cùng Con Trai, Đêm Nào Nó Cũng Dậy Tắm Lúc 3 Giờ](https://www.youtube.com/watch?v=rYrXctsullk) | Kể Chuyện Trải Đời | 77 phút | 421k | Ngôi thứ nhất, cấu trúc "dị thường lặp lại" |

Cả ba đều cùng một thị trường: người nghe lớn tuổi, nghe lúc đêm, chủ đề mẹ chồng — nàng dâu,
con cái bất hiếu, tuổi xế chiều. Truyện dài 75–110 phút nhưng giữ chân được, nên câu hỏi đáng
học không phải "viết hay thế nào" mà "vì sao người ta không tắt giữa chừng".

---

## 1. Mở bằng tai hoạ, không mở bằng bối cảnh

Bản mạnh nhất (video 2) không bắt đầu từ đầu câu chuyện. Nó bắt đầu từ *cảnh tệ nhất*:

> "Mẹ đi đi, con không có người mẹ nhẫn tâm như mẹ." Câu nói đó được ném ra giữa cơn mưa
> rằm tháng bảy ở ngõ Khâm Thiên […] hũ sành 10 cây vàng bà gom góp cả đời bà không mang
> theo được. Bởi vì lúc đó hũ sành đã bị con dâu bà trộm đi.
>
> **Câu chuyện này phải kể về 7 ngày trước cái đêm mưa ấy.**

Người nghe biết ngay: bà sẽ mất hết và bị đuổi ra đường. Họ ở lại không phải để biết *chuyện gì
xảy ra* mà để biết *nó xảy ra bằng cách nào*. Đây là công cụ giữ chân rẻ nhất và mạnh nhất.

Ranh giới quan trọng: cold open **được phép** tiết lộ tai hoạ, **không được** tiết lộ thủ đoạn,
kẻ đứng sau, hay quả báo. Video 2 nói thẳng "con dâu trộm vàng" ngay câu thứ tư mà vẫn không
hỏng truyện, vì cái người nghe thật sự chờ là *bằng cách nào* và *rồi con dâu lãnh gì*.

→ Mã hoá tại: `ARCH.coldOpen` (moment / alreadyLost / timeJump) và `HOOK` bước 2–3–6.
`HOOK_WORDS` nâng từ 180 lên 260 để đủ chỗ dựng cảnh.

## 2. Câu báo trước — "Bà không biết đó là lần cuối…"

Kỹ thuật lặp lại nhiều nhất trong video 2, khoảng 6–8 lần, mỗi lần tốn đúng một câu:

> Bà lành đâu biết cái hũ sành bà đang ôm trên xe khách đêm đó là cái hũ cuối cùng bà còn
> được tự tay mở ra đậy lại.
>
> Bà không biết cái chén trà này là cái chén trà cuối cùng Thủy rót cho bà.
>
> Bà không biết đó là nén nhang cuối cùng bà thắp được trong căn nhà ngõ Khâm Thiên.

Mỗi câu là một cliffhanger tí hon đặt giữa cảnh yên bình. Ba đặc điểm khiến nó hiệu quả:
neo vào **một vật cụ thể vừa xuất hiện**; chỉ nói **mất gì**, không nói mất bằng cách nào;
và luôn đặt ngay sau đoạn nhân vật đang yên tâm nhất.

Đây là ngoại lệ duy nhất đáng có với quy tắc "diễn, không giảng" — prompt cũ cấm mọi câu bình
của người kể nên vô tình chặn luôn kỹ thuật này.

→ Mã hoá tại: `WR` quy tắc 9 (tối đa 1 câu/cảnh), ngoại lệ thêm vào `WR` quy tắc 2, và
`EDIT` quy tắc 2 được sửa để **không** cắt các câu này. `CHECK` thêm loại lỗi
"báo trước lạm dụng" để chặn nhờn.

## 3. Một chi tiết vật lý kiểm chứng được, dùng làm bằng chứng

Bà Lành buộc miệng hũ vàng theo kiểu riêng: **ba vòng quấn ngang, một vòng móc xuống**.
Vài chương sau:

> Cái nút trên hũ bây giờ là hai vòng ngang một nút thắt đơn.

Người nghe biết bà bị phản bội trước khi có bất kỳ bằng chứng nào khác, và biết *cùng lúc*
với nhân vật — không sớm hơn, không muộn hơn. Chi tiết này khác motif: motif để mang nghĩa,
cái nút này để tố giác. Truyện còn dùng lại cùng cơ chế với nếp gấp tờ hoá đơn buffet mà bà
cẩn thận gấp lại "đúng kiểu cũ không lệch".

→ Mã hoá tại: `ARCH.tellDetail` (object / normalState / tamperedState / noticeChapter).

## 4. Người nghe luôn biết nhiều hơn nhân vật chính

Video 2 liên tục cắt sang phản diện đang âm thầm làm việc xấu, mỗi đoạn chỉ 150–300 từ:
Thủy khoá trái cửa nhà tắm nhắn tin cho nhân tình; Nhân đứng tầng 26 Royal City nhìn hũ vàng
thật nằm trên tấm nhung đỏ. Nhân vật chính vắng mặt hoàn toàn trong các đoạn này.

Hiệu ứng: người nghe sốt ruột. Họ nghe tiếp vì muốn nhân vật chính *nhận ra*.

→ Mã hoá tại: `OUT.dramaticIrony` (bắt buộc mỗi chương, không được trùng) và
`OUT.antagonistInsert`; `SC` yêu cầu đúng một cảnh trong chương gánh đoạn chen đó với
`povCharacter` là phản diện và `estimatedWords` 150–300.

## 5. Kẻ lừa bị lừa lại trước khi pháp luật kịp ra tay

Tựa video 2 là "NÓ TƯỞNG TÔI NGU", đề từ là "người tính không bằng trời tính". Cấu trúc quả báo
ba tầng: Thủy lừa bà Lành → Nhân đánh thuốc mê Thủy, ôm 10 cây vàng đi, để lại mảnh giấy
*"Loại đàn bà phản chồng hại mẹ chồng như cô không xứng làm vợ ai"* → hộ chiếu giả của Nhân
kêu một tiếng ở quầy check-in Tân Sơn Nhất khi hắn đang nắm tay cô gái tiếp theo.

Kẻ ác bị chính đồng bọn hạ trước, rồi mới tới pháp luật. Nhân vật chính không nhúng tay vào
tầng nào cả.

→ Mã hoá tại: `ARCH.secondPredator` (character / preysOn / betrayalChapter).

## 6. Quả báo là xã hội và chậm, không phải bạo lực

Đoạn thoả mãn nhất không phải lúc toà tuyên án, mà là:

> Phạm nhân không có người thăm là phạm nhân khổ nhất chị ạ. Nó không có gói đồ nào từ ngoài
> gửi vào. Không có ai gọi điện thoại, không có thư.

Và với Nhân — hai bà cụ nạn nhân cũ vào trại, ngồi im nhìn hắn qua tấm kính rồi về, không chửi
một câu; hắn không ăn nổi cơm mấy hôm. *"Không cần ai đánh nó, không cần ai chửi nó. Nó tự đau."*
Mẹ đẻ Thủy từ mặt con bằng một câu: *"Từ nay đừng gọi tao là mẹ nữa."*

Kèm theo là **beat từ chối tiền**, xuất hiện ở cả video 1 và 2, và luôn làm nhân vật đáng trọng
với chi phí bằng không: *"Con đụng vào tiền này con thấy mặt mình."*

→ Mã hoá tại: dòng `ending` trong `ARCH` (quả báo đến từ xã hội và thời gian; nhân vật chính
không ra tay, chỉ dừng lại và sống tiếp tử tế).

## 7. Con số cụ thể, câu ngắn, kết cảnh bằng cảnh vật

Ba thói quen câu chữ khiến bản 2 nghe "thật" hơn hẳn bản 1:

**Con số thật, lẻ, và nhất quán.** 10 cây vàng; nợ gần 2 tỷ; thông báo ngân hàng 71 triệu quá hạn;
hoá đơn buffet hải sản 4 người 2,7 triệu; thuê 4 người đập cửa 5 triệu một thằng; bán vàng
tuổi 98 được 1 tỷ 380, trừ chiết khấu còn 1 tỷ 320; sổ tiết kiệm cuối truyện 2 tỷ 800 =
1,38 + 0,7 + 0,8. Tiền được ghi sổ như kế toán, và người nghe cộng theo được.

**Câu ngắn, lặp chủ ngữ.** *"Bà ngồi xuống mép giường. Bà mở tủ. Bà kéo cái hũ ra."* Người nghe
không tua lại được, nên câu ghép nhiều mệnh đề là mất thông tin.

**Kết cảnh bằng một câu tả sự vật dửng dưng.** *"Ngoài sân, gió cuối thu thổi một cành ổi rụng
xuống. Một con thằn lằn bò vội từ thân cây xuống đất. Trời chiều mây xám."* Không bình luận thêm.

→ Mã hoá tại: `ARCH.ledger` (5–8 con số neo cả truyện), `WR` quy tắc 10 (con số cụ thể),
11 (câu ngắn cho giọng đọc), 12 (nhịp kết cảnh). `CHECK` thêm loại lỗi "số liệu lệch".

## 8. Trẻ con và hàng xóm là người nói thật

Thằng Cubin 5 tuổi ngậm kẹo mút nói đúng hai lần — một lần với bà Lành, một lần với Thành —
và cả hai lần đều bị gạt đi. Đến đêm quyết định, chính câu đó vang lại trong đầu Thành. Bà Nụ
hàng xóm là người đếm giờ xe máy về: *"Sớm thì 11 giờ, muộn thì 2 giờ sáng."*

Trong thể loại này, trẻ con và hàng xóm là nhân chứng không thể bác bỏ, vì họ không có động cơ.

→ Mã hoá tại: `ARCH.truthWitness` (character / relation / truthTold / dismissedBy).

## 9. Cliffhanger phải là sự việc, không phải câu hỏi tu từ

Video 1 hay kết đoạn bằng lời bình của người kể. Video 2 kết bằng việc vừa xảy ra: cửa sắt
đóng sầm, đồng hồ quả lắc điểm 12 giờ, tiếng ba tiếng đập cửa. Video 3 dùng biến thể riêng —
**dị thường lặp lại theo giờ cố định**: 3 giờ sáng, tiếng vòi sen. Cùng một sự kiện lặp 3–4 lần,
mỗi lần lộ thêm một chi tiết, cho tới cảnh nhìn qua khe cửa. Rồi cú lật: tiếng nước không phải
tội ác, nó là cách gột rửa sau tội ác — đúng thói quen của người chồng vũ phu đã chết.

→ Mã hoá tại: dòng `cliffhanger` trong `OUT` (phải là sự việc vật lý hoặc câu thoại vừa buông,
đặt ở câu cuối chương).

---

## Những gì cố ý không lấy

- **Giọng toàn tri nhảy đầu liên tục** của video 1 (một đoạn đi qua suy nghĩ của Yến, Đoàn,
  Hồng, bà Hoà) — rẻ tiền và làm loãng đồng cảm. Prompt vẫn giữ `povCharacter` theo cảnh.
- **Đoạn tình dục cưỡng ép** trong video 1, kể trần trụi mà không phục vụ cốt truyện.
- **Người kể phán xét thay người nghe** ("Đôi khi sự hư hỏng của một gã đàn ông trăng hoa cũng
  có một phần lỗi xuất phát từ người đàn bà cam chịu"). `WR` quy tắc 8 đã yêu cầu để dư luận
  có ít nhất hai chiều trái ngược thay vì để người kể chốt.

## Tóm tắt thay đổi prompt

| Prompt | Thêm / sửa |
|---|---|
| `ARCH` | `coldOpen`, `tellDetail`, `secondPredator`, `truthWitness`, `ledger`; siết lại `ending` |
| `OUT` | `dramaticIrony`, `antagonistInsert`; siết lại `cliffhanger` |
| `SC` | Đúng một cảnh/chương gánh `antagonistInsert`, POV phản diện, 150–300 từ |
| `WR` | Ngoại lệ ở quy tắc 2; thêm quy tắc 9 (câu báo trước), 10 (con số), 11 (câu ngắn), 12 (kết cảnh) |
| `HOOK` | 5 bước → 6 bước, dựng cảnh cold open trước khi bình luận |
| `EDIT` | Quy tắc 2 không được cắt câu báo trước |
| `CHECK` | Thêm loại lỗi: số liệu lệch, báo trước lạm dụng, cold open không trả bài |
| `pipeline.ts` | `HOOK_WORDS` 180 → 260; truyền `CHAPTERS` vào `ARCH` |

Sửa kèm: `ARCH` trước đây không hề biết truyện có bao nhiêu chương, nên `motif.invertChapter`,
`antagonistWound.revealChapter` (và các trường `*Chapter` mới) có thể rơi ra ngoài khoảng chương
thật — smoke test lần đầu trả về `noticeChapter: 7` và `betrayalChapter: 11` cho một truyện 6
chương. Nay `ARCH` nhận `{{CHAPTERS}}` và được yêu cầu giữ mọi trường `*Chapter` trong khoảng
1..N. Chạy `npx tsx scripts/smoke-prompts.ts` để kiểm lại nhanh.
