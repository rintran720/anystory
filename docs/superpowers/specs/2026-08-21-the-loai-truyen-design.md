# Thể loại truyện (genre) — Design

Date: 2026-08-21

## Mục tiêu

Hiện tại toàn bộ 13 prompt trong `src/prompts.ts` bake cứng một thể loại duy nhất: drama gia đình Việt Nam, trục bạo hành/thao túng leo thang, kết bằng quả báo từ xã hội. Không có cách nào sinh truyện thể loại khác.

Mục tiêu:

1. Đưa khái niệm **thể loại** (genre) vào pipeline, mỗi thể loại có xương sống kể chuyện riêng nhưng dùng chung một lõi quy tắc craft.
2. Thêm thể loại **ngôn tình sủng — hôn nhân thay thế**, dựng theo phong cách một video audio tham khảo.
3. Cho **chọn thể loại khi tạo truyện mới** trên web UI, và bảo đảm các bước chấm điểm / sửa chương về sau dùng đúng rubric của thể loại đó.

Ràng buộc đã thống nhất qua brainstorming:

- Kiến trúc **lai**: một lõi craft dùng chung + mỗi thể loại một "spine" riêng (trường Story Bible, trường Outline, công thức Hook/Outro, rubric chấm điểm). Không chép nguyên 13 prompt cho mỗi thể loại.
- Đợt này làm **đúng 2 thể loại**: `drama` (bộ hiện tại, tách nguyên trạng) và `ngontinh` (mới).
- Thể loại ngôn tình: **hook ngắn ~70 từ + outro ngắn ~150 từ thuần CTA** (video mẫu không có lời dẫn kiểu kênh drama và không có lời kết bình luận nhân vật; giữ outro ngắn cho mục đích YouTube).
- Ngôn tình kể **ngôi 1 nữ** ("tôi"), bám video mẫu.
- Truyện cũ trên đĩa mặc định là `drama`, hành vi **không đổi gì**.

## Nguồn tham chiếu

Video: `https://www.youtube.com/watch?v=0vAvNT14Fkw` — "Gả Thay Chị Gái, Tôi Được Thái Tử Gia Cưng Chiều", kênh DUDU AUDIO, 1.149.431 view, 2810 giây (~47 phút), đăng 2025-05-03. Transcript tự động tiếng Việt ~11.227 từ đã rút và phân tích.

Lưu ý: tiêu đề dùng "thái tử gia" như **biệt danh giới tài chính** ("thái tử gia của giới tài chính", kế thừa tập đoàn Tần Thị) — bối cảnh là **hiện đại đô thị**, không phải cổ trang. Thể loại thực chất: ngôn tình hiện đại, mô-típ hôn nhân thay thế + tổng tài sủng vợ.

### Đặc trưng phong cách rút từ transcript

| Yếu tố | Video mẫu | Pipeline hiện tại |
|---|---|---|
| Ngôi kể | Ngôi 1 nữ ("tôi"), hồi tưởng quá khứ | Ngôi 3, đa POV |
| Động cơ nghe tiếp | Ngọt + hiểu lầm "mình chỉ là người thay thế" + bí mật "anh đã yêu em từ lâu" | Tai họa báo trước + leo thang bạo hành |
| Xương sống | Thang thân mật tăng dần + thang nghi ngờ | `escalationLadder` 8-12 nấc bạo lực/thao túng |
| Phản diện | Chị gái, tình địch, mẹ chồng — áp lực ngoại lai, không phải trung tâm | `antagonistWound`, `secondPredator` — trung tâm truyện |
| Mở đầu | Lời hứa cảm xúc ngôi 1, ~2 câu | `coldOpen` = cảnh tai họa dựng thành 3-4 câu |
| Kết | HE — cưới lại, tuần trăng mật thị trấn biển | Quả báo từ xã hội, nhân vật chính không ra tay |
| Nội tâm | Tự trào, hài, giọng web-novel hiện đại | Không có |
| Câu văn | Rất ngắn, điệp cấu trúc, thoại "sát thương" 1 câu | Tương tự (quy tắc 11 của `WR` đã có) |

Các câu trích làm chuẩn (dùng làm ví dụ trong prompt):

- Mở đầu: *"Tôi chưa bao giờ nghĩ sẽ có ngày mình mặc váy cưới thay chị gái."*
- Điệp cấu trúc: *"Là người luôn đứng sau lưng chị ấy trong mọi bức ảnh gia đình. Là người bị lãng quên trong các bữa tiệc. Là người nên biết ơn khi được lựa chọn."*
- Thoại sát thương: *"Dù em có thay thế ai đi nữa, với tôi, em chưa từng là người thay thế."* / *"Chờ em thì giờ nào tôi cũng dậy được."* / *"Anh đang yêu em. Nếu điều đó là quá mức thì anh sẽ không giới hạn nữa."*
- Nội tâm tự trào: *"Xin lỗi, ai cho anh bắn thẳng tim tôi lúc sáng sớm vậy?"* / *"Tôi cảm giác như não mình vừa được bơm trực tiếp 80 ml đường nguyên chất."* / *"Một chữ ừ làm tôi muốn dẹp luôn cái bánh đi để ăn ảnh."*
- Phản ứng cơ thể kết cảnh: *"Tim tôi đập lệch một nhịp."*
- Bí mật nam chính: tấm ảnh cũ trong sổ tay — lần đầu gặp dưới mưa, cô cấp hai, cái ô đen, gói khăn giấy. *"Không phải vì em khóc mà là vì em vẫn cố nhịn không khóc."*
- Kết: *"Lần trước là em bị ép, lần này là em tự nguyện."*

## Kiến trúc

### Tách module prompt

`src/prompts.ts` (một file, 13 hằng số) tách thành thư mục:

```
src/prompts/
  core.ts        quy tắc craft dùng chung + helper P + các mảnh prompt chia sẻ
  drama.ts       spine hiện tại, tách nguyên trạng
  ngontinh.ts    spine mới
  index.ts       getGenre(id) -> GenrePrompts
```

`src/prompts.ts` **bị xóa**; `src/pipeline.ts` và `scripts/smoke-prompts.ts` đổi import sang `./prompts/index.js`.

`core.ts` giữ những gì đúng với mọi thể loại — sửa một quy tắc craft chỉ phải sửa một chỗ:

- Helper `P(s, vars)` (giữ nguyên).
- Khối `NO_META`: cấm Markdown, cấm "Dưới đây là"/"Đây là phiên bản"/stage directions.
- Khối `VOICE_RULES`: câu ngắn cho giọng đọc, tối đa 3 người thoại, gọi tên thay vì "anh ấy/cô ấy" khi hai nhân vật cùng giới, số viết bằng chữ, không chơi chữ dựa mặt chữ.
- Khối `CONCRETE_RULES`: con số cụ thể lấy từ `ledger`/`timeline`, không tóm tắt thời gian, chi tiết đời sống Việt Nam có tên gọi cụ thể.
- Khối `SHOW_RULES`: diễn không giảng, không lặp kết luận cảm xúc, sự việc mới phải xảy ra trên trang.
- `MEM`, `FIXVERIFY`: dùng chung nguyên vẹn, chỉ tham số hóa tên các mảng chống lặp (xem "Bộ nhớ" bên dưới).
- `EDIT`, `FIXCH`: khung dùng chung, chèn một khối `{{GENRE_EDIT_RULES}}` riêng theo thể loại.

### Interface `GenrePrompts`

`getGenre(id)` trả về:

```ts
type GenreId = "drama" | "ngontinh";

interface GenrePrompts {
  id: GenreId;
  label: string;                 // nhãn tiếng Việt cho UI
  ARCH: string; OUT: string; SC: string; WR: string;
  HOOK: string; OUTRO: string; MEM: string; EDIT: string;
  CHECK: string; REVIEW_CH: string; REVIEW_SUM: string;
  FIXCH: string; FIXVERIFY: string;
  hookWords: number;             // drama 260, ngontinh 70
  outroWords: number;            // drama 450, ngontinh 150
  bibleRequired: string[];       // danh sách field validate ở stage 1
  chapterCriteria: string[];     // 6 khóa điểm của REVIEW_CH
  actsText(chapters: number): string;
  usedMemoryKeys: string[];      // mảng chống lặp truyền vào WR qua {{USED}}
}
```

Ba hằng số hiện đang nằm rải rác trong `pipeline.ts` chuyển vào spine: `HOOK_WORDS`/`OUTRO_WORDS` (dòng 2), danh sách field validate bible (inline trong stage 1), và `actsText()` — bản drama hiện tại kết bằng *"kết thúc có hậu nhưng để mở (open ending)"*, bản ngôn tình phải là HE trọn vẹn nên không dùng chung được.

`getGenre(id)` với `id` lạ hoặc `undefined` trả về spine `drama` (fallback an toàn cho truyện cũ).

### Spine ngôn tình — trường Story Bible

Thay 1-đổi-1 các trục của drama:

| Drama | Ngôn tình | Nội dung |
|---|---|---|
| `escalationLadder` | `sweetLadder` | Mảng 8-12 nấc thân mật tăng dần, mỗi nấc **một cơ chế khác**: đoán trước nhu cầu, bênh vực nơi đông người, chạm nhẹ có chủ ý, quà mang ký ức riêng, tự tay nấu ăn, ghen, tuyên bố trước gia tộc, cầu hôn lại. Không lặp cơ chế. |
| — | `doubtLadder` | Mảng 5-8 nấc nghi ngờ *"mình chỉ là người thay thế"*, mỗi nấc từ **một nguồn khác**: lời chị gái, tin đồn công ty, tấm ảnh cũ, mẹ chồng, bài báo. Đây là động cơ nghe tiếp thay cho leo thang bạo hành. |
| `antagonistWound` | `maleLeadSecret` | `{character, memory, revealChapter}` — vì sao anh đã chọn cô **từ trước**. `memory` phải là một cảnh cụ thể có thời tiết + đạo cụ + một câu anh nhớ mãi. Khi tiết lộ, mọi hành vi "biết trước" của anh từ đầu truyện được giải thích ngược lại. |
| `truthWitness` | `heroineWound` | `{wound, healChapter}` — vết thương gốc của nữ chính (mẫu: *"luôn là phương án dự phòng"*). Được **chữa lành**, không phải được vạch trần. |
| `secondPredator` | `rival` | `{character, relation, tactic, showdownChapter}` — tình địch (chị gái/người cũ), giành lại vị trí. |
| — | `familyGate` | `{opponent, objection, confrontChapter}` — cửa ải gia tộc; nam chính công khai bênh nữ chính trước mặt cả nhà. |
| `coldOpen` | `openingConfession` | `{line, promise}` — `line` là câu mở ngôi 1 dạng *"Tôi chưa bao giờ nghĩ..."*; `promise` là lời hứa cảm xúc khiến người nghe ở lại. **Không** hé lộ `maleLeadSecret`. |
| `ending` | `happyEnding` | `{scene, callback}` — cảnh HE cụ thể + câu gọi lại `openingConfession` (mẫu: *"Lần trước là em bị ép, lần này là em tự nguyện."*). |
| `tellDetail` | — | Bỏ. |
| — | `signatureLine` | Câu thoại sát thương chủ đạo của nam chính, đại diện cả truyện. |

Giữ nguyên từ drama (cùng tên, đổi nghĩa trong mô tả prompt): `title`, `genre`, `theme`, `premise`, `tone`, `characters`, `setting`, `mainConflict`, `secondaryConflicts`, `moral`, `motif` (đổi nghĩa thành **vật chứng tình cảm** — vòng cổ ngọc lam, con đường hoa, tấm ảnh cũ; vẫn có `invertChapter` vì nghĩa của nó vẫn lật), `ledger`, `titleCandidates`.

`bibleRequired` cho ngôn tình: `title, genre, theme, premise, tone, characters, setting, mainConflict, moral, motif, sweetLadder, doubtLadder, maleLeadSecret, openingConfession, happyEnding`.

### Spine ngôn tình — trường Outline

| Drama | Ngôn tình | Nội dung |
|---|---|---|
| `escalationType` | `sweetBeat` | Lấy từ `sweetLadder`, không chương nào trùng chương nào. |
| — | `doubtBeat` | Lấy từ `doubtLadder`. Được phép rỗng ở các chương cuối sau khi hiểu lầm đã giải. |
| `pressureLevel` | `intimacyLevel` | 1..N, tăng nghiêm ngặt theo số chương. |
| `protagonistAction` | `heroineAction` | Nữ chính **chủ động** làm gì. Bắt buộc mỗi chương; không được chỉ chờ được cưng chiều. |
| `antagonistInsert` | `maleLeadInsert` | Đoạn chen 150-300 từ cắt sang POV nam chính lúc nữ chính vắng mặt, hé lộ anh âm thầm làm gì (dặn quản gia, giữ tấm ảnh, chặn một bài báo). |
| — | `swoonLine` | **Đúng một** câu thoại sát thương của nam chính trong chương, không trùng chương khác. Đây là thứ tạo ra lượt xem của video mẫu. |
| `povCharacter` | `povCharacter` | Gần như luôn là nữ chính. Tối đa 2 chương được nhìn từ mắt nam chính. |

Giữ nguyên: `chapter`, `title`, `purpose`, `conflict`, `emotionalState`, `reveal`, `climax`, `cliffhanger`, `estimatedWords`, `dramaticIrony`.

`dramaticIrony` đặc biệt hợp thể loại này: người nghe biết anh đã yêu cô từ lâu, cô thì chưa — giữ nguyên yêu cầu "mỗi chương một điều khác nhau".

`reveal`: `maleLeadSecret` phải được tiết lộ ở khoảng 55-70% truyện; `familyGate.confrontChapter` và `rival.showdownChapter` ở khoảng 75-90%.

### Spine ngôn tình — trường Scene

Giữ nguyên toàn bộ trường của `SC` (`scene`, `title`, `location`, `characters`, `purpose`, `conflict`, `emotionalChange`, `reveal`, `endingBeat`, `estimatedWords`, `povCharacter`, `pronounRegister`, `signatureProp`, `newIncident`), đổi hai định nghĩa:

- `pronounRegister`: bảng riêng — `"tôi-anh"` (giai đoạn hợp đồng, còn xa cách), `"anh-em"` (đã ấm), `"anh-em thân mật"` (đã yêu). **Bỏ `mày-tao`** — thể loại này không có bạo lực ngôn từ.
- `signatureProp`: đạo cụ đời thường **tông đô thị hiện đại** (ly hồng trà, áo khoác vắt trên ghế, chìa khóa xe, tin nhắn điện thoại, hộp bánh quế) thay cho điếu cày / chậu nước lá.

Quy tắc "đúng một cảnh gánh `antagonistInsert`" đổi thành "đúng một cảnh gánh `maleLeadInsert`", giữ nguyên cơ chế.

### Spine ngôn tình — quy tắc viết (`WR`)

Giữ nguyên từ `core.ts` các quy tắc 1-7 và 10-12 hiện tại (xưng hô, diễn không giảng, không lặp kết luận cảm xúc, sự việc mới, chi tiết cụ thể, không tóm tắt thời gian, viết cho người nghe, con số cụ thể, câu ngắn cho giọng đọc). Thay ba quy tắc drama:

- **#8 dư luận (hai cách nhìn trái ngược của đám đông)** → **nội tâm tự trào**: mỗi cảnh có ít nhất một câu nội tâm hài hước của "tôi", dạng phóng đại đời thường. Đây là chất giọng web-novel hiện đại mà bộ prompt drama hoàn toàn không có, và là khác biệt lớn nhất về giọng giữa hai thể loại.
- **#9 câu báo trước mất mát** → **câu thoại sát thương**: đặt đúng `swoonLine` của chương vào cao trào cảm xúc của một cảnh, ngắn, đứng một mình, **không** có câu người kể giải thích ý nghĩa ngay sau đó.
- **#12 kết cảnh bằng câu tả sự vật dửng dưng** → **kết cảnh bằng phản ứng cơ thể** của nữ chính (*"tim tôi đập lệch một nhịp"*, *"tôi đỏ mặt đến tận tai"*, *"tôi đứng đơ ba giây"*).

Thêm ba quy tắc riêng:

- Ngôi 1 nữ xuyên suốt, thì quá khứ hồi tưởng. Chỉ các cảnh gánh `maleLeadInsert` mới đổi sang ngôi 3 theo nam chính.
- Cho phép **tối đa một** chuỗi điệp cấu trúc 3 câu cùng khuôn mỗi chương (mẫu: *"Là người... Là người... Là người..."*).
- Cấm bạo lực thân thể, cấm chửi thề. Xung đột giải quyết bằng lời và bằng việc nam chính đứng ra bênh.

### Spine ngôn tình — Hook và Outro

`HOOK` ngôn tình, ~70 từ, đi đúng 3 bước:

1. Câu `openingConfession.line` nguyên văn, giọng "tôi".
2. 1-2 câu dựng tình thế: chị gái biến mất, tờ giấy để lại, người đàn ông đứng cuối lễ đường.
3. Một câu hứa cảm xúc từ `openingConfession.promise`, dẫn thẳng vào chương 1.

**Không** tục ngữ, **không** "Mời quý vị cùng lắng nghe", **không** hé lộ `maleLeadSecret`.

`OUTRO` ngôn tình, ~150 từ, thuần CTA:

1. Một câu chốt lại hình ảnh cuối của truyện.
2. Một câu hỏi nhẹ cho người nghe về khoảnh khắc họ thích nhất.
3. Kêu gọi like/đăng ký/bình luận, cảm ơn, chào tạm biệt.

**Không** phân tích nhân vật xám, **không** nhắc lại `moral` — đó là công thức của kênh drama, không phải kênh ngôn tình.

### Spine ngôn tình — `EDIT` và `FIXCH`

Khung dùng chung từ `core.ts` (giữ plot/tên/tuổi/quan hệ, xóa lặp ý, cắt giảng giải, sửa timeline theo `MEMORY`, không rút ngắn quá 15%). Khối `{{GENRE_EDIT_RULES}}` riêng:

- drama: giữ nguyên quy tắc hiện tại — giữ lại câu báo trước dạng *"Bà không biết đó là lần cuối..."*, chỉ cắt khi một cảnh có nhiều hơn một câu như vậy.
- ngontinh: giữ lại `swoonLine` của chương nguyên vẹn và **không** thêm câu người kể giải thích sau nó; kiểm tra ngôi kể không trượt từ "tôi" sang ngôi 3 giữa chừng (trừ đoạn `maleLeadInsert`); giữ lại ít nhất một câu nội tâm tự trào mỗi cảnh, cắt bớt nếu có quá 3 câu trong cùng một cảnh (đùa quá dày sẽ loãng cảnh tình cảm).

`FIXCH` bổ sung tương ứng: câu cuối chương phải đúng `cliffhanger`; với ngôn tình, `swoonLine` của chương phải còn nguyên trong bản sửa.

### Spine ngôn tình — `CHECK` và rubric chấm điểm

`CHECK` (continuity): đổi danh sách `type` — bỏ `leo thang trùng lặp`, `cold open không trả bài`; thêm `thang ngọt trùng lặp` (hai chương dùng cùng `sweetBeat`), `swoonLine trùng`, `nghi ngờ không giải` (nấc `doubtLadder` gài ra mà không bao giờ được gỡ), `mở đầu không trả bài` (`openingConfession.promise` không được thực hiện).

`REVIEW_CH` — đổi 2 trong 6 khóa điểm:

| Khóa | drama | ngontinh |
|---|---|---|
| `hook` | giữ | giữ |
| `nhipDo` | giữ | giữ |
| `showKhongTell` | giữ | giữ |
| `hoiThoai` | giữ | giữ |
| `cangThang` → | căng thẳng: áp lực cuối chương cao hơn đầu chương, đúng `escalationType` | **`ngotNgao`**: `sweetBeat` có xảy ra trên trang không, `swoonLine` có đắt không hay sáo rỗng, `intimacyLevel` có tăng thật không |
| `nhanVat` → | nhân vật có động cơ riêng, phản diện có lý lẽ | **`namChinh`**: nam chính có nhất quán với `maleLeadSecret` không (biết trước, chờ đợi), hay bị thành robot ngôn tình chỉ biết nói lời ngọt |

`REVIEW_SUM` — **giữ nguyên 6 khóa** (`cauTruc`, `vongCungNhanVat`, `caoTrao`, `ketThuc`, `doMoiLa`, `bamMoralMotif`), chỉ đổi định nghĩa: `caoTrao` = đối đầu tình địch + cửa ải gia tộc có xứng với `doubtLadder` đã dựng không; `ketThuc` = HE có được dựng dần hay đến đột ngột, có gọi lại `openingConfession` không; `doMoiLa` = có lặp `sweetBeat` hay lặp kiểu `swoonLine` không.

Giữ nguyên khóa `REVIEW_SUM` là có chủ ý: `staleChapters`, `needsFix`, `scoreSum` và màn hình review đều đọc `summary.overall` và mảng scores một cách generic, nên phần tổng hợp không cần đụng gì.

### Bộ nhớ (`MEM`) và chống lặp

`MEM` dùng chung, nhưng mảng chống lặp khác nhau:

- drama: `usedEmotionalBeats`, `usedEscalationTypes` (như hiện tại).
- ngontinh: `usedEmotionalBeats`, `usedSweetBeats`, `usedDoubtBeats`, `usedSwoonLines`.

Prompt `MEM` sinh danh sách khóa từ `usedMemoryKeys` của spine. `pipeline.ts` truyền đúng các khóa đó vào `{{USED}}` của `WR`.

`dedupeMemoryArrays` trong `src/utils.ts` hardcode danh sách khóa cần cap. Thêm `usedSweetBeats`, `usedDoubtBeats`, `usedSwoonLines` (cap 20, 20, 20) vào mảng đó. Khóa không tồn tại trong memory bị bỏ qua sẵn, nên thêm vô điều kiện là an toàn cho cả hai thể loại.

`validateOutline` / `validateScenePlan` trong `src/ollama.ts` chỉ enforce `chapter`/`title`/số thứ tự cảnh — vốn đã genre-agnostic, **không cần sửa**.

## Luồng dữ liệu

### Config

`src/types.ts`: thêm `export type GenreId = "drama" | "ngontinh";` và field `genre: GenreId` vào `Config`.

`src/config.ts`: `genre: (process.env.STORY_GENRE as GenreId) ?? "drama"`. `loadSettingsOverrides()` nhận `s.genre` nếu là một trong hai giá trị hợp lệ (đặt thể loại mặc định cho form tạo truyện).

### Ghi thể loại vào truyện

`generateStory` ghi `genreId` vào `story_bible.json` ngay sau khi tạo hoặc đọc bible ở stage 1:

```
bible.genreId = c.genre   // rồi mới writeJSON(bf, bible)
```

Dùng `genreId` chứ không phải `genre` vì prompt `ARCH` đã sinh sẵn một field `genre` dạng văn xuôi ("drama gia đình, tâm lý xã hội") — hai thứ khác nhau, không được đè lên nhau.

`story_bible.json` được chọn làm nơi lưu vì nó là file định danh của truyện: luôn tồn tại, được cache và đọc lại ở mọi stage sau, kể cả khi review/fix chạy nhiều ngày sau.

`reviewStory` và `fixStory` đọc `getGenre(bible.genreId)` qua `loadStoryFiles(out)` (đã sẵn đọc bible) và dùng spine đó cho `REVIEW_CH` / `REVIEW_SUM` / `FIXCH` / `FIXVERIFY`. Truyện cũ không có `genreId` → `getGenre(undefined)` → `drama` → hành vi y hệt hiện tại.

`appendRunInfo` ghi thêm `genre: c.genre` vào mỗi entry.

### API

`POST /api/generate`: nhận `genre` ở cấp shared config và cấp từng item (`items[].genre`), giống cách `chapters`/`scenesPerChapter` đang làm. `queueStoryTask`/`buildJobConfig` gán `genre: input.genre ?? baseConfig.genre`, validate bằng whitelist — giá trị lạ trả 400 chứ không im lặng rơi về drama, vì sinh nhầm thể loại cả một truyện thì tốn hàng trăm lệnh gọi LLM.

`GET /api/config`: trả thêm `genre` (mặc định cho form) và `genres: [{id,label}]` để UI dựng dropdown mà không hardcode.

`GET /api/stories`: trả thêm `genre` mỗi truyện, đọc từ `story_bible.json` (thêm một `readJSONIfExists` mỗi thư mục; route này đã đọc `outline.json` và `review-report.json` nên chi phí tương đương).

`GET /api/stories/:name`: đã trả nguyên `bible`, nên UI đọc `bible.genreId` được luôn — **không cần sửa route này**.

`POST /api/review/:name`, `POST /api/fix/:name`: **không nhận** genre override. Thể loại là thuộc tính của truyện đã viết, không phải của lần chấm; chấm một truyện ngôn tình bằng rubric drama là vô nghĩa. (`provider`/`model` vẫn override được như hiện tại.)

### UI

`public/index.html`:

- Thêm `<label>Thể loại <select id="field-genre">` vào fieldset "Cấu hình" của form tạo truyện, options nạp từ `/api/config`.
- Thêm cột "Thể loại" vào `#story-table`.

`public/app.js`:

- `loadDefaults()` nạp options và chọn sẵn `defaults.genre`.
- Payload submit thêm `genre: document.getElementById("field-genre").value`.
- Bảng home hiển thị nhãn thể loại.
- `CHAPTER_CRITERIA` ở dòng 555 đang hardcode 6 khóa. Đổi thành: lấy khóa từ chính `Object.keys(row.scores)` của report, tra nhãn trong một bảng gộp cả hai thể loại (`cangThang: "Căng thẳng"`, `ngotNgao: "Độ ngọt"`, `nhanVat: "Nhân vật"`, `namChinh: "Nam chính"`, ...), khóa lạ thì hiện nguyên tên khóa. Cách này cũng tự chịu được thể loại thứ ba sau này mà không phải sửa lại.
- `SUMMARY_CRITERIA` (dòng 557) giữ nguyên vì khóa `REVIEW_SUM` không đổi.

### Smoke test

`scripts/smoke-prompts.ts` nhận tham số thể loại qua `process.argv[2]` (mặc định `drama`), lấy `getGenre(id)` và:

- validate bible theo `bibleRequired` của spine thay vì danh sách hardcode;
- in các trường đặc trưng của spine (drama: `coldOpen`/`tellDetail`/`secondPredator`/`truthWitness`/`ledger`; ngontinh: `openingConfession`/`sweetLadder`/`doubtLadder`/`maleLeadSecret`/`happyEnding`);
- kiểm tra khoảng chương của mọi field `*Chapter` do spine khai báo;
- in mỗi chương: `dramaticIrony`, insert, cliffhanger, và với ngôn tình thêm `swoonLine`;
- gọi `HOOK` với `pr.hookWords`.

Ghi vào `output/_smoke-<genre>/` để hai thể loại không đè lên nhau.

Cần thêm một file ý tưởng mẫu: `stories/example-ngontinh/idea.txt` — mô-típ gả thay chị gái, để smoke test có đầu vào đúng thể loại.

## Tương thích ngược

| Tình huống | Kết quả |
|---|---|
| Truyện cũ trên đĩa (không có `genreId`) | `getGenre(undefined)` → drama → mọi prompt y hệt trước |
| `settings.json` cũ (không có `genre`) | `config.genre` = `"drama"` |
| CLI `npm run dev` không truyền gì | drama |
| `review-report.json` cũ | Khóa điểm `cangThang`/`nhanVat`, UI tra nhãn được → hiển thị như cũ |
| Resume một truyện drama đang viết dở | bible đã cache, `genreId` được gán khi đọc lại, không sinh lại gì |

Rủi ro duy nhất đáng kể: **refactor `prompts.ts` làm đổi hành vi thể loại drama một cách không chủ ý**. Chốt chặn là bước kiểm chứng 2 bên dưới.

## Kiểm chứng

1. `npx tsc --noEmit` sạch.
2. **Chứng minh tách file không đổi hành vi drama**: trước khi refactor, dựng chuỗi prompt cuối cùng (sau khi `P()` thay biến) cho cả 13 prompt drama với một bộ biến cố định, ghi ra file. Sau khi refactor, dựng lại và `diff` — phải giống hệt từng ký tự. Đây là bài kiểm tra rẻ và dứt khoát hơn nhiều so với chạy lại `smoke-prompts` rồi đọc bằng mắt (vốn không xác định vì LLM sinh khác nhau mỗi lần).
3. `npx tsx scripts/smoke-prompts.ts drama` chạy được, không lỗi validate.
4. `npx tsx scripts/smoke-prompts.ts ngontinh` trên `stories/example-ngontinh/idea.txt`: bible có `sweetLadder` (8-12 nấc, cơ chế không lặp), `doubtLadder`, `maleLeadSecret.revealChapter` nằm trong 1..N; outline mỗi chương có `swoonLine` khác nhau, có `sweetBeat` không trùng, **không có** `escalationType`/`pressureLevel`; hook ≤ 85 từ và không chứa "Mời quý vị".
5. Chạy đủ một truyện ngôn tình 3 chương qua web UI, đọc bằng mắt: ngôi 1 nữ, có nội tâm tự trào, có đúng một `swoonLine`/chương, không có bạo lực.
6. Bấm **Chấm điểm** trên truyện ngôn tình đó → `review-report.json` có khóa `ngotNgao`/`namChinh`, màn hình review hiện nhãn tiếng Việt đúng, không hiện `undefined`.
7. Mở một truyện drama cũ đã có `review-report.json` → hiển thị y như trước khi thay đổi.

## Phạm vi

Chạm: `src/types.ts`, `src/config.ts`, `src/prompts.ts` → `src/prompts/{core,drama,ngontinh,index}.ts`, `src/pipeline.ts`, `src/utils.ts`, `src/server.ts`, `public/index.html`, `public/app.js`, `scripts/smoke-prompts.ts`, `stories/example-ngontinh/idea.txt` (mới), `CLAUDE.md`.

Không chạm: `src/ollama.ts` (validator vốn genre-agnostic), `src/tts/*`, `src/index.ts` (CLI đọc config như cũ, tự nhận `genre` qua `loadSettingsOverrides`).

## Ngoài phạm vi

- Thể loại thứ ba trở đi. Kiến trúc đỡ được (thêm một file spine), nhưng không làm đợt này.
- Cơ chế đọc thể loại từ file JSON ngoài để người dùng tự thêm.
- Đổi thể loại của một truyện đã viết.
- Chọn giọng TTS theo thể loại.

---

# Phụ lục A — Trục bối cảnh (setting), bổ sung 2026-08-21

Yêu cầu phát sinh sau khi Task 1-3 đã chạy: truyện sinh ra phải lấy **bối cảnh Trung Quốc**.

Quyết định: bối cảnh là **một trục riêng, tách khỏi thể loại**, chọn được khi tạo truyện.
Lý do chọn tách thay vì khoá cứng vào thể loại: hai thứ này độc lập thật — drama gia đình
có thể diễn ra ở Trung Quốc, ngôn tình sủng có thể Việt hoá — và khoá cứng thì lần đổi ý
sau lại phải sửa prompt.

## Ngôn ngữ ≠ bối cảnh

**Ngôn ngữ kể vẫn luôn là tiếng Việt.** Đây là kênh audio tiếng Việt; chỉ thế giới trong
truyện đổi. Mọi chỗ prompt ghi "tiếng Việt" (`Viết ... bằng TIẾNG VIỆT`, `thoại tự nhiên
như người Việt nói`) là nói về ngôn ngữ và **giữ nguyên**. Chỉ 5 chỗ nói về *thế giới*
mới đổi theo bối cảnh.

Điều này khớp với video tham chiếu: "Gả Thay Chị Gái" kể bằng tiếng Việt nhưng nhân vật
tên Tần Dịch Thâm, Tô Duyệt, Tô Nhã Dung, tập đoàn Tần Thị — bối cảnh Trung Quốc.

## Năm điểm chèn

| Biến | Prompt | Hiện tại | Vì sao phụ thuộc bối cảnh |
|---|---|---|---|
| `{{SET_NAMES}}` | `ARCH` | *(không có)* | Prompt hiện KHÔNG hề nói gì về quy ước đặt tên, nên model tự đặt tên Việt. Phải thêm mới, không phải thay. |
| `{{SET_DETAIL}}` | `WR` quy tắc `chiTietViet` (core.ts) | "chi tiết đời sống **Việt Nam** có tên gọi cụ thể (món ăn, vật dụng, địa danh, thủ tục hành chính, chức danh)" | Danh mục đời sống cụ thể theo nước |
| `{{SET_PROP}}` | `SC` `signatureProp` (drama.ts) | "đạo cụ đời thường **Việt Nam** cụ thể (cái điếu cày, chậu nước lá, xe đạp điện...)" | Ví dụ đạo cụ theo nước |
| `{{SET_PROVERB}}` | `HOOK` drama (drama.ts) | "một câu tục ngữ hoặc định kiến quen thuộc của **người Việt**" | Kho tục ngữ theo nước |
| `{{SET_FOREIGN}}` | `FIXCH` (core.ts) | "xoá sạch từ **nước ngoài, chữ Hán**, và các câu vô nghĩa kiểu dịch máy" | **Nguy hiểm nhất.** Với bối cảnh Trung Quốc, tên Hán-Việt (Tần Dịch Thâm, Tô Duyệt) là thứ PHẢI GIỮ. Để nguyên câu này thì khâu sửa chương sẽ tự xoá tên nhân vật khỏi truyện. |

## Kiến trúc

`src/prompts/settings.ts`:

```ts
export type SettingId="vietnam"|"china";
export interface SettingPack{id:SettingId;label:string;names:string;detail:string;prop:string;proverb:string;foreign:string}
export const SETTINGS:Record<SettingId,SettingPack>={...}
export const settingVars=(id:SettingId)=>({SET_NAMES:...,SET_DETAIL:...,SET_PROP:...,SET_PROVERB:...,SET_FOREIGN:...})
```

`settingVars(id)` trả về object đúng dạng để trộn thẳng vào tham số của `P()`. `pipeline.ts`
tính một lần rồi spread vào mọi lệnh gọi `P()`. Prompt vẫn là chuỗi tĩnh — không đổi
`GenrePrompts`, không đổi `getGenre`.

`GenrePrompts` thêm đúng một trường: `defaultSetting:SettingId` (drama → `vietnam`,
ngontinh → `china`).

`Config.setting:SettingId|"auto"`, mặc định `"auto"`. `"auto"` được giải thành
`getGenre(genre).defaultSetting`. Nhờ đó chọn thể loại ngôn tình là tự ra bối cảnh Trung
mà không phải chọn hai lần, nhưng vẫn ép được nếu muốn.

Bible đóng dấu **giá trị đã giải**, không đóng dấu `"auto"`: `bible.settingId`. Bible cũ
không có trường này đọc là `vietnam` — đúng với mọi truyện đã sinh trước đây.

## Ảnh hưởng tới cổng byte-identical

Snapshot drama **sẽ đổi** ở lần này, và đổi là đúng: 5 đoạn văn bản Việt Nam biến thành
placeholder. Đây là thay đổi hành vi có chủ ý, khác hẳn Task 3 (refactor thuần). Diff của
snapshot chính là thứ để review đọc và xác nhận đúng 5 chỗ đó đổi, không hơn.

Thêm `scripts/__snapshots__/settings.txt` chụp nội dung hai `SettingPack`, để sau này sửa
mô tả bối cảnh cũng nhìn thấy trong diff.

## Ngoài phạm vi

- Bối cảnh thứ ba (Hàn Quốc, phương Tây). Kiến trúc đỡ được: thêm một `SettingPack`.
- Đổi bối cảnh của truyện đã viết.
- Dịch/chuyển tên nhân vật của truyện cũ sang tên Trung.
