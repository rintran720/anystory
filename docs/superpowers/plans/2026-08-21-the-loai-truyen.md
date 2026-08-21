# Thể loại truyện (genre) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa khái niệm thể loại vào pipeline sinh truyện — tách `src/prompts.ts` thành lõi craft dùng chung + spine riêng theo thể loại, thêm thể loại ngôn tình sủng, và cho chọn thể loại khi tạo truyện mới trên web UI.

**Architecture:** `src/prompts.ts` (13 hằng số, một thể loại duy nhất) tách thành `src/prompts/{core,drama,ngontinh,index}.ts`. `core.ts` giữ quy tắc craft đúng với mọi thể loại và các hàm dựng prompt; mỗi file spine cung cấp phần xương sống kể chuyện riêng và export một object `GenrePrompts`; `index.ts` export `getGenre(id)`. `pipeline.ts` gọi `getGenre(c.genre)` một lần rồi dùng `pr.ARCH` thay cho `ARCH`. Thể loại được đóng dấu vào `story_bible.json` (`genreId`) nên chấm điểm/sửa chương chạy sau đó nhiều ngày vẫn dùng đúng rubric.

**Tech Stack:** TypeScript ESM chạy qua `tsx`, Express 5, không có framework test, không có linter.

**Spec:** [docs/superpowers/specs/2026-08-21-the-loai-truyen-design.md](../specs/2026-08-21-the-loai-truyen-design.md)

## Global Constraints

- **Không có test framework.** Kiểm chứng dựa vào ba thứ, tất cả đều chạy được bằng lệnh: `npx tsc --noEmit`, golden-file snapshot của prompt (`scripts/snapshot-prompts.ts` + `git diff --exit-code`), và script assert invariant (`scripts/check-genre-prompts.ts`, exit code 1 khi fail). Không viết `describe`/`it`/`expect` — không có runner nào chạy chúng.
- **Style code:** file dưới `src/` (trừ `src/tts/index.ts`) viết **dày đặc** — không dòng trống giữa các câu lệnh, ít format. `src/prompts/*.ts` phải theo style này. `scripts/*.ts` và `public/*.js` viết format bình thường như các file hiện có.
- **Thể loại mặc định là `"drama"` ở mọi nơi.** `getGenre(undefined)` và `getGenre("<giá trị lạ>")` đều trả spine drama. Truyện cũ trên đĩa không có `genreId` phải chạy y hệt trước.
- **Hai `GenreId` hợp lệ đợt này:** `"drama"`, `"ngontinh"`. Không thêm thể loại thứ ba.
- **Trường trong bible là `genreId`, KHÔNG phải `genre`** — prompt `ARCH` đã sinh sẵn field `genre` dạng văn xuôi, đè lên nhau là hỏng.
- Số từ hook/outro: drama `260`/`450`, ngontinh `70`/`150`.
- Khóa điểm `REVIEW_CH`: drama `hook,nhipDo,showKhongTell,hoiThoai,cangThang,nhanVat`; ngontinh `hook,nhipDo,showKhongTell,hoiThoai,ngotNgao,namChinh`. Khóa `REVIEW_SUM` **giống nhau ở cả hai thể loại**: `cauTruc,vongCungNhanVat,caoTrao,ketThuc,doMoiLa,bamMoralMotif`.
- Mọi commit kết bằng `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Nhánh làm việc: `feat/story-genres` (đã tạo, đã có commit spec).

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `scripts/snapshot-prompts.ts` | **Tạo.** Dựng chuỗi cuối cùng của cả 13 prompt một thể loại, ghi ra `scripts/__snapshots__/<genre>-prompts.txt`. Là golden-file test của refactor. |
| `scripts/__snapshots__/drama-prompts.txt` | **Tạo (commit).** Ảnh chụp prompt drama TRƯỚC refactor. Sau refactor phải giống hệt từng ký tự. |
| `scripts/__snapshots__/ngontinh-prompts.txt` | **Tạo (commit).** Ảnh chụp prompt ngôn tình, để thay đổi prompt về sau nhìn thấy được trong diff. |
| `scripts/check-genre-prompts.ts` | **Tạo.** Assert invariant giữa hai spine (trường nào phải/không được có, fallback, khóa điểm). Exit 1 khi fail. |
| `src/prompts/core.ts` | **Tạo.** Quy tắc craft dùng chung + hàm dựng prompt + các prompt dùng chung nguyên vẹn. |
| `src/prompts/drama.ts` | **Tạo.** Spine drama, text bê nguyên văn từ `src/prompts.ts`. |
| `src/prompts/ngontinh.ts` | **Tạo.** Spine ngôn tình sủng. |
| `src/prompts/index.ts` | **Tạo.** `GenrePrompts`, `getGenre`, `GENRES`. |
| `src/prompts.ts` | **Xóa** sau khi Task 3 xong. |
| `src/types.ts` | Thêm `GenreId`, `Config.genre`. |
| `src/config.ts` | Default `genre`, đọc `genre` từ `settings.json`. |
| `src/pipeline.ts` | Dùng `getGenre`, ghi `bible.genreId`, review/fix đọc lại từ bible. |
| `src/utils.ts` | Thêm khóa chống lặp mới vào `dedupeMemoryArrays`. |
| `src/server.ts` | `/api/config` trả danh sách thể loại, `/api/generate` nhận + validate, `/api/stories` trả genre. |
| `public/index.html` | Dropdown thể loại, cột thể loại. |
| `public/app.js` | Nạp dropdown, gửi genre, nhãn khóa điểm theo report. |
| `scripts/smoke-prompts.ts` | Nhận tham số thể loại. |
| `stories/example-ngontinh/idea.txt` | **Tạo.** Ý tưởng mẫu mô-típ gả thay chị gái. |
| `CLAUDE.md` | Tài liệu thể loại. |

---

## Task 1: Golden-file snapshot của prompt drama

Task này **không đổi hành vi gì**. Nó dựng lưới an toàn cho Task 3 — thứ duy nhất chứng minh được việc tách file không làm lệch thể loại drama.

**Files:**
- Create: `scripts/snapshot-prompts.ts`
- Create: `scripts/__snapshots__/drama-prompts.txt` (sinh ra rồi commit)

**Interfaces:**
- Consumes: `src/prompts.ts` — `P, ARCH, OUT, SC, WR, HOOK, OUTRO, MEM, EDIT, CHECK, REVIEW_CH, REVIEW_SUM, FIXCH, FIXVERIFY`
- Produces: file snapshot mà Task 3 diff lại; script sẽ được sửa ở Task 3 để nhận tham số thể loại.

- [ ] **Step 1: Viết script snapshot**

Tạo `scripts/snapshot-prompts.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import {P, ARCH, OUT, SC, WR, HOOK, OUTRO, MEM, EDIT, CHECK, REVIEW_CH, REVIEW_SUM, FIXCH, FIXVERIFY} from "../src/prompts.js";

// Bộ biến cố định: giá trị không quan trọng, chỉ cần mọi lần chạy đều như nhau
// để diff phản ánh đúng thay đổi của prompt chứ không phải của dữ liệu.
const VARS: Record<string, string> = {
  IDEA: "<IDEA>", CHAPTERS: "6", WORDS: "14400", ACTS: "<ACTS>", BIBLE: "<BIBLE>",
  COUNT: "5", CHAPTER: "<CHAPTER>", MEMORY: "<MEMORY>", SCENE: "<SCENE>",
  USED: "<USED>", RECENT: "<RECENT>", OUTLINE: "<OUTLINE>", ENDING: "<ENDING>",
  DRAFT: "<DRAFT>", STORY: "<STORY>", TEXT: "<TEXT>", TOTAL: "6", ISSUES: "<ISSUES>"
};

const PROMPTS: [string, string][] = [
  ["ARCH", ARCH], ["OUT", OUT], ["SC", SC], ["WR", WR], ["HOOK", HOOK], ["OUTRO", OUTRO],
  ["MEM", MEM], ["EDIT", EDIT], ["CHECK", CHECK], ["REVIEW_CH", REVIEW_CH],
  ["REVIEW_SUM", REVIEW_SUM], ["FIXCH", FIXCH], ["FIXVERIFY", FIXVERIFY]
];

const body = PROMPTS.map(([name, tpl]) => `########## ${name} ##########\n${P(tpl, VARS)}`).join("\n\n");
const outFile = path.resolve("scripts/__snapshots__/drama-prompts.txt");
await fs.mkdir(path.dirname(outFile), {recursive: true});
await fs.writeFile(outFile, body, "utf8");
console.log(`wrote ${outFile} (${body.length} chars, ${PROMPTS.length} prompts)`);
```

- [ ] **Step 2: Chạy script, sinh baseline**

Run: `npx tsx scripts/snapshot-prompts.ts`
Expected: in ra `wrote .../drama-prompts.txt (<N> chars, 13 prompts)` với N > 25000.

- [ ] **Step 3: Kiểm tra snapshot ổn định (chạy lại phải không đổi)**

Run: `npx tsx scripts/snapshot-prompts.ts && git status --short scripts/__snapshots__/`
Expected: file vẫn `??` (chưa track), nội dung không đổi giữa hai lần chạy.

- [ ] **Step 4: Kiểm tra snapshot có đúng nội dung mong đợi**

Run: `grep -c '^##########' scripts/__snapshots__/drama-prompts.txt && grep -c 'escalationLadder\|Mời quý vị cùng lắng nghe' scripts/__snapshots__/drama-prompts.txt`
Expected: `13` ở lệnh đầu, và số > 0 ở lệnh sau (xác nhận đã chụp đúng prompt drama chứ không phải file rỗng).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: không lỗi.

- [ ] **Step 6: Commit**

```bash
git add scripts/snapshot-prompts.ts scripts/__snapshots__/drama-prompts.txt
git commit -m "$(cat <<'EOF'
test: snapshot the rendered drama prompts before splitting them

The next commits move 27KB of Vietnamese prompt text out of one file
into a shared core plus per-genre spines. Nothing in the repo would
catch a rule quietly changing meaning on the way, and re-running the
smoke script cannot catch it either: the LLM answers differently every
time, so a drifted prompt looks the same as a drifted model.

Rendering all 13 prompts with a fixed variable set and committing the
result turns that into a diff.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `GenreId` và `Config.genre`

**Files:**
- Modify: `src/types.ts:1` (interface `Config`)
- Modify: `src/config.ts` (object `config`, hàm `loadSettingsOverrides`)

**Interfaces:**
- Produces: `export type GenreId = "drama"|"ngontinh"` từ `src/types.js`; `Config.genre: GenreId`. Task 3-7 đều dùng.

- [ ] **Step 1: Thêm `GenreId` và field `genre` vào types**

Trong `src/types.ts`, thêm **trước** `export interface Config`:

```ts
export type GenreId="drama"|"ngontinh";
```

Trong `interface Config`, thêm `genre:GenreId;` ngay sau `language:string;` (giữ style dày đặc, không xuống dòng thêm).

- [ ] **Step 2: Type-check để thấy nó fail**

Run: `npx tsc --noEmit`
Expected: FAIL — `src/config.ts` báo object `config` thiếu property `genre`. Đây là dấu hiệu đúng: type mới đã bắt được chỗ chưa khai báo.

- [ ] **Step 3: Thêm default vào `config`**

Trong `src/config.ts`, đổi `import type {Config}` thành `import type {Config,GenreId} from "./types.js";`.

Thêm helper ngay sau dòng import:

```ts
const asGenre=(v:any):GenreId|null=>v==="drama"||v==="ngontinh"?v:null;
```

Trong object `config`, thêm ngay sau `language:"vi",`:

```ts
genre:asGenre(process.env.STORY_GENRE)??"drama",
```

- [ ] **Step 4: Đọc `genre` từ `settings.json`**

Trong `loadSettingsOverrides()`, thêm ngay sau dòng xử lý `s.provider`:

```ts
const g=asGenre(s.genre);if(g)o.genre=g;
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Kiểm chứng default và override bằng lệnh**

Run:
```bash
npx tsx -e 'import{config}from"./src/config.js";console.log("default:",config.genre)'
STORY_GENRE=ngontinh npx tsx -e 'import{config}from"./src/config.js";console.log("env:",config.genre)'
STORY_GENRE=khong-ton-tai npx tsx -e 'import{config}from"./src/config.js";console.log("bad env:",config.genre)'
```
Expected: `default: drama`, `env: ngontinh`, `bad env: drama`.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/config.ts
git commit -m "$(cat <<'EOF'
feat: add a genre field to Config, defaulting to drama

An unrecognised value falls back to drama rather than throwing, because
this field is read on every CLI run and server boot, and a typo in
settings.json should not take the whole pipeline down.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Tách `prompts.ts` thành core + spine drama

Đây là task rủi ro nhất. Cổng chấp nhận là **snapshot phải giống hệt từng ký tự**.

**Quy tắc tuyệt đối cho task này:** mọi đoạn text tiếng Việt phải được **cắt-dán nguyên văn** từ `src/prompts.ts`, không gõ lại, không sửa chính tả, không đổi dấu câu. Nếu thấy chỗ nào viết sai, **để nguyên** — sửa nó là việc khác, làm sau, ở commit riêng.

**Files:**
- Create: `src/prompts/core.ts`, `src/prompts/drama.ts`, `src/prompts/index.ts`
- Delete: `src/prompts.ts`
- Modify: `src/pipeline.ts:1` (import), `scripts/smoke-prompts.ts:5` (import), `scripts/snapshot-prompts.ts` (import + nhận tham số thể loại)

**Interfaces:**
- Consumes: `GenreId` từ Task 2.
- Produces:
  - `src/prompts/index.ts`: `export interface GenrePrompts {...}`, `export function getGenre(id?:string):GenrePrompts`, `export const GENRES:{id:GenreId;label:string}[]`, và re-export `P`.
  - `src/prompts/core.ts`: `P`, `buildWR`, `buildSC`, `buildEDIT`, `buildFIXCH`, `buildMEM`, `WR_RULES`, `MEM_KEYS_DOC`, `FIXVERIFY`, `NO_META`.

- [ ] **Step 1: Định nghĩa interface trong `src/prompts/index.ts`**

```ts
import type{GenreId}from"../types.js";import{DRAMA}from"./drama.js";
export{P}from"./core.js";
export interface GenrePrompts{id:GenreId;label:string;ARCH:string;OUT:string;SC:string;WR:string;HOOK:string;OUTRO:string;MEM:string;EDIT:string;CHECK:string;REVIEW_CH:string;REVIEW_SUM:string;FIXCH:string;FIXVERIFY:string;hookWords:number;outroWords:number;bibleRequired:string[];chapterCriteria:string[];usedMemoryKeys:string[];actsText(chapters:number):string}
const ALL:Record<GenreId,GenrePrompts>={drama:DRAMA} as any;
export const GENRES:{id:GenreId;label:string}[]=[{id:"drama",label:DRAMA.label}];
export function getGenre(id?:string):GenrePrompts{return(id&&(ALL as any)[id])||ALL.drama}
```

`ngontinh` được thêm vào `ALL` và `GENRES` ở Task 5; ép kiểu `as any` là tạm cho tới lúc đó.

- [ ] **Step 2: Dựng `src/prompts/core.ts`**

`core.ts` chứa, tất cả bê nguyên văn từ `src/prompts.ts`:

1. `export const P=...` — chuyển nguyên dòng 1.
2. `export const NO_META=` — chuỗi cấm Markdown/meta xuất hiện ở cuối `WR`, bắt đầu từ `OUTPUT là văn bản truyện thuần túy.` đến hết `"Chapter:".` Tách ra vì `WR` drama và `WR` ngôn tình dùng chung y hệt.
3. `export const WR_RULES` — object chứa 9 quy tắc dùng chung của `WR`, **không kèm số thứ tự** (số sẽ được `buildWR` sinh lại):
   - `xungHo` (quy tắc 1 hiện tại)
   - `dienKhongGiang` — là **hàm** `(exception:string)=>string`, vì câu cuối quy tắc 2 hiện tại là `Ngoại lệ DUY NHẤT là câu báo trước ở quy tắc 9.` mà ngôn tình có ngoại lệ khác. Drama truyền đúng chuỗi `câu báo trước ở quy tắc 9`.
   - `khongLapKetLuan` (quy tắc 3), `suVieMoi` (4), `chiTietViet` (5), `khongTomTatThoiGian` (6), `vietChoNguoiNghe` (7), `conSoCuThe` (10), `cauNganChoGiongDoc` (11)
4. `export const buildWR=(o:{intro:string;rules:string[];refs:string})=>` — ghép: `${o.intro}\nQUY TẮC BẮT BUỘC:\n` + các quy tắc đánh số `1.`..`N.` nối bằng `\n` + `\n${NO_META}` + `${o.refs}`.
5. `buildSC`, `buildEDIT`, `buildFIXCH`, `buildMEM` — cùng nguyên tắc: phần khung chung nhận các khối riêng theo thể loại qua tham số.
6. `export const FIXVERIFY=` — chuyển nguyên, dùng chung không đổi.

**Cách làm an toàn:** dựng từng prompt một, sau mỗi prompt chạy lại snapshot và diff. Đừng chuyển cả 13 rồi mới diff — khi đó lỗi ở đâu sẽ không biết.

- [ ] **Step 3: Dựng `src/prompts/drama.ts`**

```ts
import type{GenrePrompts}from"./index.js";
// ... các hằng riêng của drama (ARCH, OUT, HOOK, OUTRO, CHECK, REVIEW_CH, REVIEW_SUM), bê nguyên văn
export const DRAMA:GenrePrompts={id:"drama",label:"Drama gia đình / quả báo",ARCH,OUT,SC,WR,HOOK,OUTRO,MEM,EDIT,CHECK,REVIEW_CH,REVIEW_SUM,FIXCH,FIXVERIFY,hookWords:260,outroWords:450,bibleRequired:["title","genre","theme","premise","tone","characters","setting","mainConflict","secondaryConflicts","ending","moral","motif","escalationLadder"],chapterCriteria:["hook","nhipDo","showKhongTell","hoiThoai","cangThang","nhanVat"],usedMemoryKeys:["usedEmotionalBeats","usedEscalationTypes"],actsText};
```

`bibleRequired` phải khớp **đúng** danh sách đang hardcode trong `src/pipeline.ts` stage 1. `actsText` chuyển nguyên hàm từ `src/pipeline.ts:11` sang đây (`pipeline.ts` sẽ dùng `pr.actsText` ở Task 4; tạm thời cứ để bản cũ trong `pipeline.ts`, Task 4 xoá).

- [ ] **Step 4: Cập nhật script snapshot để nhận tham số thể loại**

Sửa `scripts/snapshot-prompts.ts`: đổi import sang `import {P, getGenre} from "../src/prompts/index.js";`, đọc `const id = process.argv[2] ?? "drama";`, `const g = getGenre(id);`, mảng `PROMPTS` lấy từ `g.ARCH` v.v., ghi ra `scripts/__snapshots__/${g.id}-prompts.txt`. Thêm vào cuối mảng snapshot một khối metadata để những trường không phải prompt cũng nằm trong diff:

```ts
const meta = `########## META ##########\nid=${g.id}\nlabel=${g.label}\nhookWords=${g.hookWords}\noutroWords=${g.outroWords}\nbibleRequired=${g.bibleRequired.join(",")}\nchapterCriteria=${g.chapterCriteria.join(",")}\nusedMemoryKeys=${g.usedMemoryKeys.join(",")}\nactsText(6)=${g.actsText(6)}`;
```

Nối `meta` vào **cuối** `body`.

**Lưu ý quan trọng:** thêm khối META làm snapshot khác baseline một cách hợp lệ. Xử lý: ở Step 6 dưới đây, diff phải sạch ở **phần 13 prompt**, còn khối META là dòng thêm mới ở cuối. Kiểm bằng cách so riêng phần trước `########## META ##########`.

- [ ] **Step 5: Đổi import ở `pipeline.ts` và `smoke-prompts.ts`**

`src/pipeline.ts:1`: đổi `from"./prompts.js"` thành `from"./prompts/index.js"`, và đổi danh sách import thành `{P,getGenre}`. Ngay đầu `generateStory`, `reviewStory`, `fixStory` thêm `const pr=getGenre("drama");` **tạm thời** rồi thay `ARCH`→`pr.ARCH` v.v. cho toàn bộ 13 chỗ. (Task 4 đổi `"drama"` thành giá trị thật.)

`scripts/smoke-prompts.ts:5`: đổi thành `import {P, getGenre} from "../src/prompts/index.js";`, thêm `const pr = getGenre("drama");`, và thay `ARCH`/`OUT`/`HOOK` thành `pr.ARCH`/`pr.OUT`/`pr.HOOK`.

- [ ] **Step 6: Xoá `src/prompts.ts` và chạy cổng chấp nhận**

```bash
git rm src/prompts.ts
npx tsc --noEmit
npx tsx scripts/snapshot-prompts.ts drama
```

Rồi so phần prompt (bỏ khối META) với baseline đã commit:

```bash
git show HEAD:scripts/__snapshots__/drama-prompts.txt > /tmp/base.txt
sed '/^########## META ##########$/,$d' scripts/__snapshots__/drama-prompts.txt | sed -e :a -e '/^$/{$d;N;ba' -e '}' > /tmp/new.txt
diff /tmp/base.txt /tmp/new.txt && echo "IDENTICAL"
```

Expected: `IDENTICAL`, không dòng diff nào. **Nếu có bất kỳ dòng diff nào, dừng lại và sửa cho hết trước khi đi tiếp.** Một khoảng trắng lệch cũng phải sửa — nó có nghĩa là một quy tắc đã bị gõ lại thay vì được chuyển.

- [ ] **Step 7: Chạy lại type-check toàn bộ**

Run: `npx tsc --noEmit`
Expected: PASS, không còn tham chiếu nào tới `src/prompts.js`.

Run: `grep -rn "from\"./prompts.js\"\|from \"../src/prompts.js\"" src scripts || echo "no stale imports"`
Expected: `no stale imports`.

- [ ] **Step 8: Commit**

```bash
git add -A src/prompts src/pipeline.ts scripts/
git commit -m "$(cat <<'EOF'
refactor: split prompts into a shared craft core and a drama spine

Every prompt baked in one genre. Splitting them is the prerequisite for
a second, but the split is only safe if the drama prompts come out
byte-identical, so the rendered snapshot from the previous commit is the
acceptance gate: the 13 prompts diff clean against it.

Prompt text was moved verbatim, typos included. Fixing those is a
separate change, where the diff can actually be read.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Pipeline dùng spine thật và đóng dấu `genreId`

**Files:**
- Modify: `src/pipeline.ts` (`generateStory`, `reviewStory`, `fixStory`, `appendRunInfo`, xoá `HOOK_WORDS`/`OUTRO_WORDS`/`actsText`)
- Modify: `src/utils.ts:6` (`dedupeMemoryArrays`)

**Interfaces:**
- Consumes: `getGenre` (Task 3), `Config.genre` (Task 2).
- Produces: `story_bible.json` có field `genreId:GenreId`. Task 6-7 đọc nó.

- [ ] **Step 1: `generateStory` lấy spine từ config**

Đầu `generateStory`, ngay sau `await fs.mkdir(out,{recursive:true});`, thêm:

```ts
const pr=getGenre(c.genre);
```

Xoá `const pr=getGenre("drama");` tạm ở Task 3.

- [ ] **Step 2: Đóng dấu `genreId` vào bible**

Trong stage 1, giữa dòng tính `bible` và `await writeJSON(bf,bible)`, chèn:

```ts
bible.genreId=c.genre;
```

Đặt **sau** cả nhánh cache lẫn nhánh sinh mới, nên truyện cũ đang resume cũng được đóng dấu khi chạy tiếp. Vì `writeJSON(bf,bible)` vốn đã chạy vô điều kiện ở cả hai nhánh, không cần thêm ghi file.

Đồng thời đổi vòng lặp validate field bắt buộc từ danh sách hardcode sang `for(const k of pr.bibleRequired)`.

- [ ] **Step 3: Thay hằng số bằng giá trị của spine**

- Xoá dòng `const HOOK_WORDS=260,OUTRO_WORDS=450;` (dòng 2).
- Xoá hàm `actsText` (dòng 11).
- `P(pr.OUT,{... ACTS:pr.actsText(c.chapters) ...})`
- `P(pr.HOOK,{WORDS:String(pr.hookWords), ...})`
- `P(pr.OUTRO,{WORDS:String(pr.outroWords), ...})`
- Chỗ dựng `{{USED}}` cho `WR`: đổi từ object hardcode `{usedEmotionalBeats,usedEscalationTypes}` sang dựng từ `pr.usedMemoryKeys`:

```ts
USED:JSON.stringify(Object.fromEntries(pr.usedMemoryKeys.map(k=>[k,memory[k]??[]]))),
```

- [ ] **Step 4: `appendRunInfo` ghi thể loại**

Trong object `info.runs.push({...})`, thêm `genre:c.genre,` ngay sau `provider:c.provider,`.

- [ ] **Step 5: `reviewStory` và `fixStory` đọc thể loại từ bible**

Trong cả hai hàm, ngay sau `const{bible,outline}=await loadStoryFiles(out)`, thêm:

```ts
const pr=getGenre(bible?.genreId);
```

Xoá `const pr=getGenre("drama")` tạm. Thay `REVIEW_CH`→`pr.REVIEW_CH`, `REVIEW_SUM`→`pr.REVIEW_SUM`, `FIXCH`→`pr.FIXCH`, `FIXVERIFY`→`pr.FIXVERIFY`.

**Lưu ý:** `pr` phải nằm **trong** khối `try` sau `loadStoryFiles`, không đưa lên đầu hàm — trước khi đọc được bible thì chưa biết thể loại.

- [ ] **Step 6: Thêm khóa chống lặp mới vào `dedupeMemoryArrays`**

Trong `src/utils.ts:6`, mảng cap hiện là:

```ts
[["revealedSecrets",30],["usedEmotionalBeats",60],["usedEscalationTypes",20],["motifOccurrences",20]]
```

Đổi thành:

```ts
[["revealedSecrets",30],["usedEmotionalBeats",60],["usedEscalationTypes",20],["usedSweetBeats",20],["usedDoubtBeats",20],["usedSwoonLines",20],["motifOccurrences",20]]
```

Hàm đã bỏ qua khóa không tồn tại (`if(Array.isArray(m?.[k]))`), nên thêm vô điều kiện là an toàn cho cả hai thể loại.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Xác nhận không còn hằng số cũ và snapshot drama vẫn sạch**

```bash
grep -n "HOOK_WORDS\|OUTRO_WORDS\|function actsText" src/pipeline.ts || echo "constants gone"
npx tsx scripts/snapshot-prompts.ts drama && git diff --exit-code scripts/__snapshots__/drama-prompts.txt && echo "SNAPSHOT CLEAN"
```
Expected: `constants gone` rồi `SNAPSHOT CLEAN`.

- [ ] **Step 9: Kiểm chứng fallback cho truyện cũ**

```bash
npx tsx -e '
import{getGenre}from"./src/prompts/index.js";
const cases=[undefined,null,"","drama","khong-ton-tai",123];
for(const c of cases)console.log(JSON.stringify(c),"->",getGenre(c as any).id);
'
```
Expected: mọi dòng trả `drama` trừ `"drama"` cũng là `drama` — tức **tất cả** đều `drama` ở bước này (ngontinh chưa tồn tại).

- [ ] **Step 10: Commit**

```bash
git add src/pipeline.ts src/utils.ts
git commit -m "$(cat <<'EOF'
feat: drive the pipeline from the genre spine and stamp it into the bible

Word counts, the acts breakdown, the required-bible-field list and the
anti-repetition memory keys were constants in pipeline.ts; they belong to
the genre, so they move into its spine.

The genre is written to story_bible.json rather than kept in the job
config, because Chấm điểm and Sửa chương run from a button press days
later with only the output directory to go on, and judging a story by
another genre's rubric is worse than not judging it. A bible with no
genreId reads as drama, so stories written before this keep their
behaviour exactly.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Spine ngôn tình sủng

**Files:**
- Create: `src/prompts/ngontinh.ts`
- Create: `scripts/check-genre-prompts.ts`
- Create: `scripts/__snapshots__/ngontinh-prompts.txt` (sinh ra rồi commit)
- Modify: `src/prompts/index.ts` (đăng ký spine)

**Interfaces:**
- Consumes: `buildWR`, `buildSC`, `buildEDIT`, `buildFIXCH`, `buildMEM`, `WR_RULES`, `NO_META`, `FIXVERIFY` từ `core.ts`; `GenrePrompts` từ `index.ts`.
- Produces: `export const NGONTINH:GenrePrompts`; `getGenre("ngontinh")` trả về nó.

- [ ] **Step 1: Viết script kiểm invariant (chạy trước, phải fail)**

Tạo `scripts/check-genre-prompts.ts`:

```ts
import {getGenre, GENRES} from "../src/prompts/index.js";

const fails: string[] = [];
const must = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

const d = getGenre("drama");
const n = getGenre("ngontinh");

// Thể loại phải phân giải đúng, không âm thầm rơi về drama
must(n.id === "ngontinh", "getGenre('ngontinh') fell back to drama — spine not registered");
must(GENRES.map(g => g.id).sort().join(",") === "drama,ngontinh", "GENRES does not list exactly the two genres");

// Fallback an toàn cho truyện cũ và giá trị rác
for (const bad of [undefined, null, "", "khong-ton-tai", 123, {}])
  must(getGenre(bad as any).id === "drama", `getGenre(${JSON.stringify(bad)}) must fall back to drama`);

// Ngôn tình không được kéo theo xương sống của drama
for (const f of ["escalationLadder", "secondPredator", "truthWitness", "tellDetail", "coldOpen", "antagonistWound"])
  must(!n.ARCH.includes(f), `ngontinh ARCH still asks for the drama-only bible field ${f}`);
for (const f of ["sweetLadder", "doubtLadder", "maleLeadSecret", "heroineWound", "rival", "familyGate", "openingConfession", "happyEnding", "signatureLine"])
  must(n.ARCH.includes(f), `ngontinh ARCH is missing its own bible field ${f}`);

for (const f of ["escalationType", "pressureLevel", "antagonistInsert", "protagonistAction"])
  must(!n.OUT.includes(f), `ngontinh OUT still asks for the drama-only outline field ${f}`);
for (const f of ["sweetBeat", "doubtBeat", "intimacyLevel", "heroineAction", "maleLeadInsert", "swoonLine"])
  must(n.OUT.includes(f), `ngontinh OUT is missing its own outline field ${f}`);

// Công thức lời dẫn / lời kết của kênh drama không được lẫn sang
must(!n.HOOK.includes("Mời quý vị cùng lắng nghe"), "ngontinh HOOK still carries the drama sign-off");
must(!n.OUTRO.includes("Quý thính giả thân mến"), "ngontinh OUTRO still opens like the drama channel");
must(n.hookWords === 70 && n.outroWords === 150, "ngontinh hook/outro word counts wrong");
must(d.hookWords === 260 && d.outroWords === 450, "drama hook/outro word counts changed");

// Thể loại này không có bạo lực ngôn từ
must(!n.SC.includes("mày-tao"), "ngontinh SC still offers the may-tao register");

// Khóa điểm phải khớp giữa khai báo và prompt
must(d.chapterCriteria.join(",") === "hook,nhipDo,showKhongTell,hoiThoai,cangThang,nhanVat", "drama chapterCriteria changed");
must(n.chapterCriteria.join(",") === "hook,nhipDo,showKhongTell,hoiThoai,ngotNgao,namChinh", "ngontinh chapterCriteria wrong");
for (const g of [d, n]) {
  for (const k of g.chapterCriteria)
    must(g.REVIEW_CH.includes(`"${k}"`), `${g.id} REVIEW_CH prompt does not declare the key ${k}`);
  for (const k of ["cauTruc", "vongCungNhanVat", "caoTrao", "ketThuc", "doMoiLa", "bamMoralMotif"])
    must(g.REVIEW_SUM.includes(`"${k}"`), `${g.id} REVIEW_SUM prompt does not declare the shared key ${k}`);
  for (const k of g.bibleRequired)
    must(g.ARCH.includes(k), `${g.id} lists ${k} in bibleRequired but ARCH never asks for it`);
  for (const k of g.usedMemoryKeys)
    must(g.MEM.includes(k), `${g.id} lists ${k} in usedMemoryKeys but MEM never tracks it`);
  must(g.actsText(6).length > 0 && g.actsText(2) !== undefined, `${g.id} actsText broken`);
}

if (fails.length) { console.error(fails.map(f => `FAIL ${f}`).join("\n")); process.exit(1); }
console.log(`all genre prompt invariants OK (${GENRES.length} genres)`);
```

- [ ] **Step 2: Chạy để thấy nó fail**

Run: `npx tsx scripts/check-genre-prompts.ts`
Expected: FAIL, exit code 1, dòng đầu `FAIL getGenre('ngontinh') fell back to drama — spine not registered`.

- [ ] **Step 3: Viết `ARCH` của ngôn tình**

Tạo `src/prompts/ngontinh.ts`. Prompt đầu tiên (giữ style dày đặc, một hằng một dòng):

```ts
const ARCH=`Bạn là kiến trúc sư truyện ngôn tình. Thiết kế Story Bible bằng TIẾNG VIỆT cho một truyện ngôn tình hiện đại dài ĐÚNG {{CHAPTERS}} chương, mô-típ hôn nhân thay thế và tổng tài sủng vợ. Mọi trường có tên kết thúc bằng "Chapter" phải là số nguyên từ 1 đến {{CHAPTERS}}. Gồm title,genre,theme,premise,tone,characters,setting,mainConflict,secondaryConflicts,moral,motif,heroineWound,maleLeadSecret,sweetLadder,doubtLadder,rival,familyGate,openingConfession,happyEnding,signatureLine,ledger,titleCandidates.\n- NGÔI KỂ: truyện kể ở ngôi thứ nhất, nữ chính xưng "tôi". characters phải ghi rõ ai là nữ chính (người kể chuyện) và ai là nam chính.\n- moral: luận đề của truyện gói trong ĐÚNG 1 câu về tình yêu và giá trị bản thân, dạng chân lý đời thường, không sáo rỗng, không lên lớp.\n- motif: {"object":"","firstMeaning":"","invertedMeaning":"","invertChapter":0} — MỘT vật chứng tình cảm CỤ THỂ lặp lại xuyên truyện (chiếc vòng cổ ngọc lam, tấm ảnh cũ kẹp trong sổ tay, con đường hoa sau nhà, ly hồng trà pha sẵn). Lần đầu mang nghĩa này, về sau CÙNG vật đó mang nghĩa ngược lại.\n- heroineWound: {"wound":"","healChapter":0} — vết thương gốc của nữ chính, dạng "tôi luôn là phương án dự phòng", "chưa ai từng chọn tôi trước". Vết thương này được CHỮA LÀNH ở healChapter chứ không phải bị vạch trần.\n- maleLeadSecret: {"character":"","memory":"","revealChapter":0} — vì sao nam chính đã chọn nữ chính TỪ TRƯỚC cuộc hôn nhân thay thế. memory phải là MỘT CẢNH CỤ THỂ có thời tiết, có một đạo cụ và một câu anh nhớ mãi (ví dụ: chiều mưa, chiếc ô đen, gói khăn giấy, "không phải vì em khóc mà vì em vẫn cố nhịn không khóc"). Khi tiết lộ ở revealChapter, mọi hành vi biết trước của anh từ đầu truyện phải được giải thích ngược lại.\n- sweetLadder: mảng 8-12 nấc thân mật tăng dần, mỗi nấc là MỘT VIỆC CỤ THỂ nam chính làm, và MỖI NẤC DÙNG MỘT CƠ CHẾ KHÁC NHAU: đoán trước nhu cầu, chuẩn bị sẵn mà không nói, bênh vực nơi đông người, chạm nhẹ có chủ ý, tặng thứ mang ký ức riêng, tự tay nấu ăn, ghen, hạ mình vì cô, tuyên bố trước gia tộc, cầu hôn lại. KHÔNG lặp lại cùng một cơ chế hai lần.\n- doubtLadder: mảng 5-8 nấc nghi ngờ của nữ chính, tất cả xoay quanh nỗi sợ "mình chỉ là người thay thế", mỗi nấc đến từ MỘT NGUỒN KHÁC NHAU: lời chị gái, tin đồn nơi làm việc, một tấm ảnh cũ, thái độ mẹ chồng, một bài báo, một cuộc gọi nghe được. Đây là thứ giữ chân người nghe: phải nặng dần rồi mới được gỡ.\n- rival: {"character":"","relation":"","tactic":"","showdownChapter":0} — người muốn giành lại vị trí bên nam chính (chị gái bỏ trốn quay về, người cũ, con gái đối tác). tactic là cách cô ta ra tay, phải cụ thể chứ không phải "gây khó dễ".\n- familyGate: {"opponent":"","objection":"","confrontChapter":0} — cửa ải gia tộc nhà nam chính. Ở confrontChapter, nam chính công khai bênh nữ chính trước mặt cả nhà bằng một câu dứt khoát.\n- openingConfession: {"line":"","promise":""} — line là câu mở truyện ở NGÔI 1, dạng "Tôi chưa bao giờ nghĩ sẽ có ngày..." nêu đúng tình thế trớ trêu. promise là lời hứa cảm xúc khiến người nghe ở lại, dạng "người đứng cuối lễ đường hôm ấy nhìn tôi như thể đã chờ tôi suốt cả cuộc đời". TUYỆT ĐỐI KHÔNG hé lộ maleLeadSecret.\n- happyEnding: {"scene":"","callback":""} — scene là cảnh kết hạnh phúc CỤ THỂ (lễ cưới nhỏ trong vườn, tuần trăng mật ở thị trấn biển). callback là MỘT câu gọi lại openingConfession, dạng "Lần trước là em bị ép, lần này là em tự nguyện".\n- signatureLine: câu thoại sát thương chủ đạo của nam chính, đại diện cho cả truyện, dưới 20 chữ.\n- ledger: mảng 5-8 con số CỤ THỂ neo cả truyện (số tháng của hôn nhân hợp đồng, số lần anh từng gặp cô trước đó, tuổi, năm học, giờ hẹn, số tầng). Mọi cảnh về sau phải dùng đúng các con số này, không được làm tròn khác đi.\n- KHÔNG có bạo lực thân thể, không chửi thề, không quả báo, không ai đi tù. Xung đột được giải quyết bằng lời nói và bằng việc nam chính đứng ra bênh.\n- titleCandidates: 3 tiêu đề kiểu kênh truyện audio ngôn tình.\nChỉ JSON hợp lệ, không Markdown hay giải thích. Ý TƯỞNG:\n{{IDEA}}`;
```

- [ ] **Step 4: Viết `OUT` của ngôn tình**

```ts
const OUT=`Bạn là biên kịch truyện ngôn tình. Tạo {{CHAPTERS}} chương tiếng Việt, tổng khoảng {{WORDS}} từ, chia 3 phần: {{ACTS}} Mỗi chương PHẢI có chapter là số nguyên, title là chuỗi không rỗng, purpose, conflict, emotionalState, reveal, climax, cliffhanger, estimatedWords là số nguyên, povCharacter, sweetBeat, doubtBeat, intimacyLevel là số nguyên, heroineAction, dramaticIrony, maleLeadInsert, swoonLine.\n- swoonLine: ĐÚNG MỘT câu thoại của nam chính trong chương này, dưới 25 chữ, đủ sức khiến người nghe tua lại nghe lần nữa. Không chương nào được trùng ý với chương khác. Đây là thứ người nghe nhớ và đi kể lại, phải viết cho đắt.\n- dramaticIrony: điều NGƯỜI NGHE biết trong chương này mà nữ chính CHƯA biết — thường là nam chính đã yêu cô từ lâu và đang âm thầm lo cho cô. Bắt buộc mỗi chương phải có và mỗi chương một điều khác nhau.\n- sweetBeat: lấy từ sweetLadder trong BIBLE. KHÔNG chương nào được trùng sweetBeat với chương khác.\n- doubtBeat: lấy từ doubtLadder trong BIBLE. Các chương cuối, sau khi hiểu lầm đã được gỡ, để chuỗi rỗng.\n- intimacyLevel: từ 1 đến {{CHAPTERS}}, tăng nghiêm ngặt theo số chương, không được đứng yên hay tụt.\n- heroineAction: nữ chính CHỦ ĐỘNG làm gì trong chương này. Bắt buộc mỗi chương phải có; không được chỉ ngồi chờ được cưng chiều, chỉ đỏ mặt hay chỉ nghĩ ngợi.\n- maleLeadInsert: một đoạn chen ngắn (150-300 từ) cắt sang nam chính lúc nữ chính vắng mặt, để lộ anh âm thầm làm gì cho cô — dặn quản gia, giở tấm ảnh cũ ra xem, chặn một bài báo, từ chối một cuộc hẹn. Ghi rõ anh làm gì, ở đâu, lúc mấy giờ.\n- cliffhanger: phải là MỘT SỰ VIỆC VẬT LÝ vừa xảy ra hoặc MỘT CÂU THOẠI vừa buông ra, đặt ở câu cuối chương. Không được là câu hỏi tu từ của người kể, không được là trạng thái cảm xúc.\n- povCharacter: gần như mọi chương nhìn từ mắt nữ chính. TỐI ĐA 2 chương được nhìn từ mắt nam chính.\n- reveal: maleLeadSecret trong BIBLE phải được tiết lộ ở chương nằm khoảng 55-70% truyện. familyGate.confrontChapter và rival.showdownChapter đặt ở khoảng 75-90%. Các chương còn lại chỉ reveal nhỏ.\nChỉ JSON {"chapters":[...]}. Không Markdown. BIBLE:\n{{BIBLE}}`;
```

- [ ] **Step 5: Viết `SC` của ngôn tình qua `buildSC`**

Khối riêng truyền vào `buildSC`: định nghĩa `pronounRegister` và `signatureProp` thay bản drama, và quy tắc đoạn chen:

```
- pronounRegister: cách xưng hô giữa nữ chính và nam chính trong cảnh, chọn theo nhiệt độ quan hệ: "tôi-anh" khi còn là hôn nhân hợp đồng và hai người còn giữ khoảng cách, "anh-em" khi đã ấm lên, "anh-em thân mật" khi đã yêu và không còn giữ ý. Phải khớp với conflict và emotionalChange của cảnh.
- signatureProp: MỘT đạo cụ đời thường đô thị hiện đại CỤ THỂ được cầm, dùng hoặc làm hỏng trong cảnh (ly hồng trà pha sẵn, áo khoác vắt trên lưng ghế, chìa khóa xe, tin nhắn chưa gửi trên điện thoại, hộp bánh quế còn ấm). Không được là đồ chung chung.
- newIncident: MỘT sự việc vật lý mới xảy ra ngay trong cảnh mà các cảnh trước chưa có. Không được ghi "hai người nhìn nhau", "cô đỏ mặt" hay bất kỳ trạng thái cảm xúc nào.
- Nếu CHAPTER có maleLeadInsert, ĐÚNG MỘT cảnh phải gánh nó: cảnh đó lấy povCharacter là nam chính, đặt lúc nữ chính vắng mặt, estimatedWords chỉ 150-300, và newIncident chính là việc nam chính âm thầm làm.
- Nếu CHAPTER có swoonLine, ĐÚNG MỘT cảnh phải chứa nó, đặt ở cao trào cảm xúc của cảnh đó.
```

- [ ] **Step 6: Viết `WR` của ngôn tình qua `buildWR`**

Dùng `WR_RULES` cho 9 quy tắc dùng chung, giữ nguyên thứ tự vị trí 1-7 và 10-11, và truyền ba quy tắc riêng vào vị trí 8, 9, 12:

```ts
const WR=buildWR({
  intro:`Viết cảnh truyện ngôn tình hoàn chỉnh bằng TIẾNG VIỆT để đọc voice-over, kể ở NGÔI THỨ NHẤT, nữ chính xưng "tôi". Show don't tell, thoại tự nhiên, subtext, nhịp tốt. Không đổi tuổi, quan hệ, bí mật; không tóm tắt; không tiếng Anh trừ tên riêng. Bám sát estimatedWords trong SCENE bên dưới (sai số ±20%); khi đạt độ dài đó, kết cảnh ngay, không viết lan man hay lặp lại.`,
  rules:[
    WR_RULES.xungHo,
    WR_RULES.dienKhongGiang("câu thoại sát thương ở quy tắc 9"),
    WR_RULES.khongLapKetLuan,
    WR_RULES.suVieMoi,
    WR_RULES.chiTietViet,
    WR_RULES.khongTomTatThoiGian,
    WR_RULES.vietChoNguoiNghe,
    `NỘI TÂM TỰ TRÀO: mỗi cảnh phải có ÍT NHẤT MỘT câu nội tâm hài hước của "tôi", dạng phóng đại đời thường, tự cười mình — ví dụ "Xin lỗi, ai cho anh bắn thẳng tim tôi lúc sáng sớm vậy?", "Tôi cảm giác như não mình vừa được bơm trực tiếp tám mươi mi-li-lít đường nguyên chất". Đây là chất giọng của truyện, không được viết nghiêm trang từ đầu đến cuối. Nhưng TỐI ĐA BA câu như vậy trong một cảnh, nhiều hơn sẽ làm loãng cảnh tình cảm.`,
    `CÂU THOẠI SÁT THƯƠNG: nếu SCENE được giao gánh swoonLine của chương, đặt đúng câu đó vào cao trào cảm xúc của cảnh. Câu ấy đứng một mình, ngắn, do nam chính nói. TUYỆT ĐỐI KHÔNG viết câu người kể giải thích ý nghĩa của nó ngay sau đó — chỉ được tả phản ứng cơ thể của "tôi".`,
    WR_RULES.conSoCuThe,
    WR_RULES.cauNganChoGiongDoc,
    `NHỊP KẾT CẢNH: nếu cảnh vừa xong một khoảnh khắc tim đập, kết bằng MỘT câu tả phản ứng cơ thể của "tôi" (tim đập lệch một nhịp, đỏ mặt đến tận tai, đứng đơ ba giây, quên mất mình đang cầm gì) rồi dừng, không bình luận thêm.`
  ],
  refs:`\nBIBLE:\n{{BIBLE}}\nCHAPTER:\n{{CHAPTER}}\nMEMORY:\n{{MEMORY}}\nSCENE:\n{{SCENE}}\nUSED:\n{{USED}}\nRECENT:\n{{RECENT}}`
});
```

Thêm hai quy tắc riêng nữa vào **cuối** mảng (vị trí 13, 14):

```ts
`NGÔI KỂ: giữ ngôi thứ nhất "tôi" xuyên suốt. NGOẠI LỆ DUY NHẤT là cảnh gánh maleLeadInsert — cảnh đó viết ở ngôi thứ ba theo nam chính. Không được trượt ngôi giữa chừng ở các cảnh khác.`,
`ĐIỆP CẤU TRÚC: được phép dùng TỐI ĐA MỘT lần trong mỗi chương một chuỗi ba câu cùng khuôn để dồn cảm xúc, dạng "Là người luôn đứng sau lưng chị ấy trong mọi bức ảnh gia đình. Là người bị lãng quên trong các bữa tiệc. Là người nên biết ơn khi được lựa chọn." Dùng nhiều hơn sẽ thành sáo.`,
`KHÔNG BẠO LỰC: cấm đánh đập, cấm chửi thề, cấm doạ giết. Mâu thuẫn cao nhất cũng chỉ đến mức lời nói lạnh và bỏ đi.`
```

- [ ] **Step 7: Viết `HOOK` và `OUTRO` của ngôn tình**

```ts
const HOOK=`Viết LỜI MỞ cho truyện audio ngôn tình tiếng Việt, khoảng {{WORDS}} từ và TUYỆT ĐỐI không quá {{WORDS}} cộng thêm 15%, để đọc voice-over. Đây KHÔNG phải lời dẫn của người dẫn chương trình mà là chính giọng nữ chính xưng "tôi" bắt đầu kể. Đi đúng 3 bước, liền mạch thành một đoạn:\n1. Chép đúng câu openingConfession.line trong BIBLE, hoặc viết lại sát nghĩa nếu câu đó chưa mượt.\n2. Một đến hai câu dựng tình thế trớ trêu: chuyện gì đã đẩy nữ chính vào chỗ đó, ai vắng mặt, cái gì được để lại.\n3. Một câu hứa cảm xúc lấy từ openingConfession.promise, dẫn thẳng vào chương 1.\nTUYỆT ĐỐI KHÔNG dùng tục ngữ, KHÔNG gọi người nghe là "quý vị", KHÔNG viết "Mời quý vị cùng lắng nghe", KHÔNG hé lộ maleLeadSecret hay cái kết. OUTPUT là văn bản thuần, không Markdown, không tiêu đề, không "Dưới đây là". BIBLE:\n{{BIBLE}}\nOUTLINE:\n{{OUTLINE}}`;
const OUTRO=`Viết LỜI KẾT NGẮN cho truyện audio ngôn tình tiếng Việt, khoảng {{WORDS}} từ, để đọc voice-over. Đây là lời của kênh nói với người nghe sau khi truyện đã hết, KHÔNG phải một bài bình luận. Đi đúng 3 bước:\n1. Một câu chốt lại hình ảnh cuối cùng của truyện.\n2. Một câu hỏi nhẹ nhàng cho người nghe về khoảnh khắc họ thích nhất trong truyện.\n3. Kêu gọi để lại bình luận, nhấn thích và đăng ký kênh, cảm ơn và chào tạm biệt.\nKHÔNG phân tích nhân vật, KHÔNG nhắc lại bài học đạo lý, KHÔNG kể lại diễn biến, KHÔNG thêm tình tiết mới, KHÔNG đặt tên kênh cụ thể. OUTPUT là văn bản thuần, không Markdown, không "Dưới đây là". BIBLE:\n{{BIBLE}}\nMEMORY:\n{{MEMORY}}\nĐOẠN KẾT TRUYỆN:\n{{ENDING}}`;
```

- [ ] **Step 8: Viết `CHECK`, `REVIEW_CH`, `REVIEW_SUM` của ngôn tình**

```ts
const CHECK=`Rà soát continuity của truyện ngôn tình tiếng Việt dưới đây. Chỉ JSON {"issues":[{"type":"","severity":"cao|vừa|thấp","detail":"","suggestion":""}],"unresolvedThreads":[],"verdict":""}. type chọn trong: timeline, dây thừa, lặp ý, nhân vật phẳng, thang ngọt trùng lặp, swoonLine trùng, nghi ngờ không giải, mở đầu không trả bài, mâu thuẫn, số liệu lệch, trượt ngôi kể. Tìm: con số tuổi hoặc mốc thời gian mâu thuẫn nhau; tình tiết gài ra rồi bỏ quên; kết luận cảm xúc lặp quá 2 lần; nhân vật chỉ xuất hiện làm nền; hai chương dùng cùng một nấc trong sweetLadder; hai câu thoại sát thương trùng ý nhau; một nấc trong doubtLadder được gài ra mà không bao giờ được gỡ; lời hứa trong openingConfession không hề được thực hiện trong truyện; con số nêu lại khác với ledger trong BIBLE; đoạn nào tuột khỏi ngôi thứ nhất mà không phải đoạn chen theo nam chính. Không bịa lỗi, nếu sạch thì trả mảng rỗng. Không Markdown. BIBLE:\n{{BIBLE}}\nTRUYỆN:\n{{STORY}}`;
```

`REVIEW_CH`: chép khung từ bản drama, đổi phần mô tả tiêu chí thành:

```
- hook: ba câu đầu có giữ được người nghe không; câu cuối chương có phải một sự kiện vật lý hoặc một câu thoại đúng như cliffhanger trong OUTLINE, chứ không phải câu hỏi tu từ.
- nhipDo: có đoạn nào lê thê, kể lại điều người nghe đã biết; hoặc ngược lại dồn quá nhanh làm mất sức nặng của khoảnh khắc tình cảm.
- showKhongTell: rung động dựng bằng hành động, đồ vật, phản ứng cơ thể hay bị người kể nói toạc ra và giảng giải.
- hoiThoai: thoại có tự nhiên như người Việt nói không; pronounRegister có khớp nhiệt độ quan hệ không; có nhân vật nào nói năng như đang đọc văn viết không.
- ngotNgao: sweetBeat của OUTLINE có thật sự XẢY RA TRÊN TRANG không hay chỉ được nhắc tới; swoonLine có được đặt vào đúng cao trào và có đắt không hay sáo rỗng, đọc lên thấy sến; intimacyLevel có cao hơn chương trước thật không.
- namChinh: nam chính có nhất quán với maleLeadSecret trong BIBLE không — anh biết trước, anh đã chờ, nên mọi hành động phải có gốc; hay anh bị viết thành robot ngôn tình chỉ biết buông lời ngọt mà không có lý do riêng.
```

Và đổi phần đối chiếu outline thành: `nếu chương thiếu dramaticIrony, thiếu maleLeadInsert là đoạn cắt sang nam chính lúc nữ chính vắng mặt, thiếu swoonLine, hoặc heroineAction không hề xảy ra, thì ghi thành issue.`

`REVIEW_SUM`: chép khung từ bản drama, **giữ nguyên 6 khóa**, đổi mô tả:

```
- cauTruc: ba hồi có cân không, có chương nào không đẩy quan hệ đi đâu cả không.
- vongCungNhanVat: nữ chính cuối truyện có khác đầu truyện không — heroineWound trong BIBLE có được chữa lành hay chỉ được nhắc tới; thay đổi đó có được dựng dần hay đến đột ngột.
- caoTrao: cuộc đối đầu với rival và cửa ải familyGate có xứng với nỗi nghi ngờ đã tích suốt truyện không, hay được giải quyết quá dễ, hay nhờ trùng hợp may mắn.
- ketThuc: happyEnding có được dựng dần không hay đến đột ngột; có gọi lại openingConfession không; mọi nấc doubtLadder đã được gỡ hết chưa.
- doMoiLa: điểm và lỗi của các chương có cho thấy lặp nấc sweetLadder hay các câu thoại sát thương na ná nhau không.
- bamMoralMotif: truyện có phục vụ moral và motif trong BIBLE hay chúng bị bỏ quên từ giữa truyện.
```

- [ ] **Step 9: `MEM`, `EDIT`, `FIXCH`, `FIXVERIFY` cho ngôn tình**

`MEM` dựng qua `buildMEM` với `usedMemoryKeys=["usedEmotionalBeats","usedSweetBeats","usedDoubtBeats","usedSwoonLines"]` và mô tả:

```
- usedSweetBeats: các nấc thân mật đã dùng (đoán trước nhu cầu, bênh vực nơi đông người, quà mang ký ức riêng, tự tay nấu ăn, ghen, tuyên bố trước gia tộc).
- usedDoubtBeats: các nguồn đã gieo nghi ngờ "mình chỉ là người thay thế" (lời chị gái, tin đồn công ty, tấm ảnh cũ, mẹ chồng, bài báo).
- usedSwoonLines: chép nguyên văn từng câu thoại sát thương của nam chính đã dùng, để các chương sau không nói lại ý cũ.
```

`EDIT` và `FIXCH` dựng qua `buildEDIT`/`buildFIXCH` với khối riêng:

```
- Giữ nguyên vẹn câu thoại sát thương của chương, KHÔNG thêm câu người kể giải thích ý nghĩa ngay sau nó.
- Kiểm tra ngôi kể không trượt từ "tôi" sang ngôi thứ ba giữa chừng, trừ đoạn chen theo nam chính.
- Giữ lại ít nhất một câu nội tâm tự trào trong mỗi cảnh; nếu một cảnh có quá ba câu như vậy thì cắt bớt, giữ câu duyên nhất.
```

`FIXVERIFY` dùng chung từ `core.ts`, không đổi.

- [ ] **Step 10: Đăng ký spine vào `index.ts`**

```ts
import{NGONTINH}from"./ngontinh.js";
const ALL:Record<GenreId,GenrePrompts>={drama:DRAMA,ngontinh:NGONTINH};
export const GENRES:{id:GenreId;label:string}[]=[{id:"drama",label:DRAMA.label},{id:"ngontinh",label:NGONTINH.label}];
```

Bỏ `as any`. `NGONTINH.label` là `"Ngôn tình sủng — hôn nhân thay thế"`.

- [ ] **Step 11: Chạy invariant check cho tới khi pass**

Run: `npx tsc --noEmit && npx tsx scripts/check-genre-prompts.ts`
Expected: PASS, in `all genre prompt invariants OK (2 genres)`.

- [ ] **Step 12: Snapshot drama vẫn phải sạch**

Run: `npx tsx scripts/snapshot-prompts.ts drama && git diff --exit-code scripts/__snapshots__/drama-prompts.txt && echo "DRAMA UNCHANGED"`
Expected: `DRAMA UNCHANGED`. Thêm thể loại mới không được đụng vào thể loại cũ.

- [ ] **Step 13: Sinh snapshot ngôn tình**

Run: `npx tsx scripts/snapshot-prompts.ts ngontinh && grep -c '^##########' scripts/__snapshots__/ngontinh-prompts.txt`
Expected: `14` (13 prompt + khối META).

Run: `grep -n 'hookWords=70\|outroWords=150\|chapterCriteria=hook,nhipDo,showKhongTell,hoiThoai,ngotNgao,namChinh' scripts/__snapshots__/ngontinh-prompts.txt`
Expected: cả ba dòng đều có.

- [ ] **Step 14: Commit**

```bash
git add src/prompts/ngontinh.ts src/prompts/index.ts scripts/check-genre-prompts.ts scripts/__snapshots__/ngontinh-prompts.txt
git commit -m "$(cat <<'EOF'
feat: add the doting-romance genre spine

Derived from a 47-minute reference audio story, so the beats are what
that form actually runs on: a ladder of sweetness and a ladder of doubt
in place of escalating abuse, a male lead who chose her years earlier in
place of a wounded antagonist, and a happy ending in place of
comeuppance. The narrator is first person throughout.

Two things the drama prompts have no room for carry most of the voice
here — one self-deprecating line of inner monologue per scene, and
exactly one line of dialogue per chapter written to be replayed — so
they are rules, not suggestions.

check-genre-prompts.ts asserts the two spines stay separated: romance
must not ask for an escalation ladder, drama must keep its sign-off, and
an unknown genre must still resolve to drama.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: API nhận và trả thể loại

**Files:**
- Modify: `src/server.ts` — `GET /api/config` (~dòng 174), `GET /api/stories` (~dòng 236), `queueStoryTask`/`buildJobConfig` (~dòng 335-342)

**Interfaces:**
- Consumes: `GENRES`, `getGenre` (Task 5); `Config.genre` (Task 2); `bible.genreId` (Task 4).
- Produces:
  - `GET /api/config` trả thêm `genre:GenreId` và `genres:{id,label}[]`.
  - `POST /api/generate` nhận `genre` ở cấp shared và `items[].genre`; giá trị lạ → `400`.
  - `GET /api/stories` trả thêm `genre:GenreId|null` mỗi truyện.

- [ ] **Step 1: `GET /api/config` trả danh sách thể loại**

Thêm import `import {GENRES} from "./prompts/index.js";` (gộp với import `needsFix` từ pipeline nếu tiện).

Trong handler, thêm vào object trả về:

```ts
genre: config.genre,
genres: GENRES
```

- [ ] **Step 2: `POST /api/generate` validate thể loại**

Trong hàm dựng job config (chỗ đang có `chapters: input.chapters ? ... : baseConfig.chapters`), thêm **trước** khi dựng `jobConfig`:

```ts
if (input.genre != null && input.genre !== "" && !GENRES.some(g => g.id === input.genre))
  return { ok: false, name, status: 400, error: `unknown genre: ${input.genre}` };
```

Rồi trong `jobConfig`, thêm:

```ts
genre: (input.genre || baseConfig.genre) as GenreId,
```

Trả `400` chứ không im lặng rơi về drama: sinh nhầm thể loại cả một truyện là mất hàng trăm lệnh gọi LLM, và lỗi chỉ lộ ra khi đọc chương 1.

Import `GenreId` từ `./types.js` nếu chưa có.

- [ ] **Step 3: `GET /api/stories` trả thể loại mỗi truyện**

Trong `.map(async e => {...})`, thêm cạnh chỗ đọc `outline`:

```ts
const bible = await readJSONIfExists(path.join(dir, "story_bible.json"));
```

và thêm vào object trả về: `genre: bible?.genreId ?? null,`.

`null` (không phải `"drama"`) để UI phân biệt được "truyện cũ chưa đóng dấu" với "truyện drama"; cả hai đều hiển thị nhãn drama, nhưng dữ liệu không nói dối.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Kiểm chứng API bằng lệnh**

Mở server ở một terminal: `npm start`

Rồi:

```bash
curl -s localhost:4000/api/config | npx tsx -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log("genre:",j.genre);console.log("genres:",JSON.stringify(j.genres))})'
```
Expected: `genre: drama` và `genres: [{"id":"drama",...},{"id":"ngontinh",...}]`.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:4000/api/generate -H 'Content-Type: application/json' -d '{"name":"__genre_test","idea":"thử","genre":"khong-ton-tai"}'
```
Expected: `400`.

```bash
curl -s localhost:4000/api/generate -H 'Content-Type: application/json' -X POST -d '{"name":"__genre_test","idea":"thử","genre":"khong-ton-tai"}'
```
Expected: body chứa `unknown genre: khong-ton-tai`.

```bash
curl -s localhost:4000/api/stories | head -c 400
```
Expected: mỗi truyện có field `"genre"`; truyện cũ là `null`.

Dừng server.

- [ ] **Step 6: Commit**

```bash
git add src/server.ts
git commit -m "$(cat <<'EOF'
feat: accept and report the story genre over the API

An unrecognised genre is a 400 rather than a fallback to drama. Config
reads fall back because a typo there should not stop the server, but a
generate request that silently writes the wrong genre costs hundreds of
LLM calls and only shows up when someone reads chapter one.

/api/stories reports null for stories written before the genre existed,
so the UI can label them drama without the data claiming they were.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Chọn thể loại trên web UI

**Files:**
- Modify: `public/index.html` (fieldset "Cấu hình" ~dòng 92-98, `#story-table` ~dòng 23)
- Modify: `public/app.js` (`loadDefaults` ~dòng 90-103, submit ~dòng 314-350, bảng home, `CHAPTER_CRITERIA` dòng 555)

**Interfaces:**
- Consumes: `/api/config` (`genre`, `genres`), `/api/stories` (`genre`), `review-report.json` (khóa trong `scores`).

- [ ] **Step 1: Thêm dropdown vào form tạo truyện**

Trong `public/index.html`, trong fieldset `Cấu hình (để trống = mặc định)`, thêm **trước** `<label>Thời lượng...`:

```html
<label>Thể loại <select id="field-genre"></select></label>
```

- [ ] **Step 2: Thêm cột thể loại vào bảng home**

Trong `#story-table`, thêm `<th>Thể loại</th>` vào hàng tiêu đề ngay sau cột tên truyện.

- [ ] **Step 3: Nạp options và giá trị mặc định**

Trong `loadDefaults()` của `public/app.js`, cạnh chỗ gán `field-chapters`/`field-scenes`/`field-duration`, thêm:

```js
const genreSelect = document.getElementById("field-genre");
genreSelect.innerHTML = (defaults.genres ?? []).map(g => `<option value="${g.id}">${g.label}</option>`).join("");
genreSelect.value = defaults.genre ?? "drama";
```

- [ ] **Step 4: Gửi thể loại khi submit**

Trong object payload của handler submit (chỗ có `chapters:`/`scenesPerChapter:`/`durationMinutes:`), thêm:

```js
genre: document.getElementById("field-genre").value || undefined,
```

- [ ] **Step 5: Hiện thể loại trong bảng home**

Ở chỗ dựng từng hàng của `#story-table-body`, thêm một `<td>` ngay sau ô tên truyện:

```js
const GENRE_LABELS = { drama: "Drama gia đình", ngontinh: "Ngôn tình sủng" };
// trong hàm dựng hàng:
`<td>${GENRE_LABELS[s.genre] ?? "Drama gia đình"}</td>`
```

Đặt `GENRE_LABELS` ở cấp module, cạnh `CHAPTER_CRITERIA`.

- [ ] **Step 6: Nhãn tiêu chí chấm điểm đọc từ chính report**

`CHAPTER_CRITERIA` ở dòng 555 hiện là mảng cứng 6 khóa. Thay bằng bảng nhãn + hàm lấy khóa từ dữ liệu:

```js
const CRITERIA_LABELS = {
  hook: "Hook", nhipDo: "Nhịp độ", showKhongTell: "Show không tell", hoiThoai: "Hội thoại",
  cangThang: "Căng thẳng", nhanVat: "Nhân vật",
  ngotNgao: "Độ ngọt", namChinh: "Nam chính"
};
const criteriaLabel = key => CRITERIA_LABELS[key] ?? key;
const criteriaKeys = scores => Object.keys(scores ?? {});
```

Thay mọi chỗ đang lặp `CHAPTER_CRITERIA` bằng `criteriaKeys(row.scores)` và mọi chỗ hiển thị tên khóa bằng `criteriaLabel(key)`. Khóa lạ hiện nguyên tên thay vì `undefined` — nên thêm thể loại thứ ba sau này không làm vỡ màn hình review.

`SUMMARY_CRITERIA` (dòng 557) **giữ nguyên** vì khóa `REVIEW_SUM` giống nhau ở cả hai thể loại.

- [ ] **Step 7: Kiểm chứng bằng mắt**

Chạy `npm start`, mở `http://localhost:4000`:

1. Bấm **+ Tạo truyện mới** → dropdown **Thể loại** có đúng 2 lựa chọn, mặc định là `Drama gia đình / quả báo`.
2. Bảng home có cột **Thể loại**; truyện cũ hiện `Drama gia đình`, không hiện `undefined` hay ô trống.
3. Mở một truyện cũ đã có `review-report.json` → bảng điểm từng chương hiện đủ 6 nhãn tiếng Việt như trước (Hook, Nhịp độ, Show không tell, Hội thoại, Căng thẳng, Nhân vật), không có `undefined`.
4. Mở Console trình duyệt → không có lỗi JS.

- [ ] **Step 8: Commit**

```bash
git add public/index.html public/app.js
git commit -m "$(cat <<'EOF'
feat: pick the genre when creating a story

The review screen's score labels now come from the keys the report
actually contains rather than a hardcoded list of six, because the two
genres score chapters on different last-two criteria and a third genre
would otherwise render undefined into the table.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Ý tưởng mẫu và smoke test theo thể loại

**Files:**
- Create: `stories/example-ngontinh/idea.txt`
- Modify: `scripts/smoke-prompts.ts`

**Interfaces:**
- Consumes: `getGenre` (Task 5).

- [ ] **Step 1: Viết file ý tưởng mẫu**

Tạo `stories/example-ngontinh/idea.txt`:

```
Tô Duyệt hai mươi bốn tuổi, cả đời đứng sau lưng chị gái Tô Nhã Dung trong mọi bức ảnh gia đình. Ba ngày trước hôn lễ, chị gái biến mất, chỉ để lại một tờ giấy viết tay run rẩy: "Em giúp chị lần này nhé. Anh ấy chưa bao giờ là người chị muốn."

Không ai hỏi ý Tô Duyệt. Họ chỉ nhìn cô, người giống chị đến tám phần, rồi gật đầu: chỉnh sửa một chút là ổn.

Người đàn ông đứng cuối lễ đường là Tần Dịch Thâm, người kế thừa duy nhất của tập đoàn Tần Thị, lạnh lùng, chưa từng dính scandal tình cảm. Anh nhìn cô, và câu đầu tiên anh nói không phải là chất vấn: "Không phải cô ấy, đúng không? Tốt."

Cô tự nhủ đây chỉ là hôn nhân hợp đồng ba tháng. Cô không biết rằng anh đã giữ một tấm ảnh cũ của cô trong sổ tay từ nhiều năm trước, chụp một chiều mưa cô đứng một mình không ô, không áo mưa, không ai gọi về.

Bối cảnh hiện đại, thành phố lớn. Giọng kể ngôi thứ nhất của Tô Duyệt, ấm, có nội tâm tự trào. Kết thúc có hậu.
```

- [ ] **Step 2: Sửa smoke script nhận tham số thể loại**

Trong `scripts/smoke-prompts.ts`:

```ts
import {P, getGenre} from "../src/prompts/index.js";

const genreId = process.argv[2] ?? "drama";
const pr = getGenre(genreId);
if (pr.id !== genreId) { console.error(`Unknown genre: ${genreId}`); process.exit(1); }
const ideaFile = genreId === "ngontinh" ? "stories/example-ngontinh/idea.txt" : "stories/example/idea.txt";
const c = {...config, ...await loadSettingsOverrides(), chapters: 6, genre: pr.id};
const out = path.resolve("output", `_smoke-${pr.id}`);
```

- Đổi validate bible sang `for (const k of pr.bibleRequired) if (!(k in x)) throw Error(\`Bible missing ${k}\`);`
- Đổi phần in field đặc trưng: quét mọi khóa của bible kết thúc bằng `Chapter` (kể cả lồng trong object một cấp) và báo có nằm trong `1..chapters` không, thay cho danh sách cứng:

```ts
const chapterFields: [string, any][] = [];
for (const [k, v] of Object.entries(bible)) {
  if (k.endsWith("Chapter")) chapterFields.push([k, v]);
  else if (v && typeof v === "object" && !Array.isArray(v))
    for (const [k2, v2] of Object.entries(v as any)) if (k2.endsWith("Chapter")) chapterFields.push([`${k}.${k2}`, v2]);
}
for (const [k, v] of chapterFields)
  console.log(`  ${v >= 1 && v <= c.chapters ? "OK " : "OUT-OF-RANGE"} ${k} = ${v} (1..${c.chapters})`);
```

- Đổi phần in outline mỗi chương thành in cả `swoonLine` khi có:

```ts
for (const ch of outline.chapters)
  console.log(`ch${ch.chapter} irony="${ch.dramaticIrony}" | swoon="${String(ch.swoonLine ?? "-").slice(0, 60)}" | insert="${String(ch.antagonistInsert ?? ch.maleLeadInsert).slice(0, 70)}" | cliff="${String(ch.cliffhanger).slice(0, 60)}"`);
```

- Đổi `ACTS` sang `pr.actsText(c.chapters)`, `HOOK` sang `pr.HOOK` với `WORDS: String(pr.hookWords)`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Chạy smoke drama (cần LLM chạy được)**

Run: `npx tsx scripts/smoke-prompts.ts drama`
Expected: chạy hết 3 stage không lỗi validate; in ra `coldOpen`, `ledger`; hook có chứa `Mời quý vị cùng lắng nghe`; ghi vào `output/_smoke-drama/`.

- [ ] **Step 5: Chạy smoke ngôn tình**

Run: `npx tsx scripts/smoke-prompts.ts ngontinh`
Expected, kiểm từng mục:
- bible có `sweetLadder` từ 8 đến 12 nấc, các nấc **không lặp cơ chế**;
- bible có `doubtLadder` từ 5 đến 8 nấc, mỗi nấc một nguồn khác nhau;
- mọi field `*Chapter` in ra `OK`, không có `OUT-OF-RANGE`;
- outline: mỗi chương có `swoonLine` khác nhau, `sweetBeat` không trùng nhau, `intimacyLevel` tăng nghiêm ngặt 1..6;
- outline **không** có `escalationType` hay `pressureLevel`;
- hook: đếm từ ≤ 85, **không** chứa `Mời quý vị`, câu đầu ở ngôi "tôi".

- [ ] **Step 6: Commit**

```bash
git add stories/example-ngontinh/idea.txt scripts/smoke-prompts.ts
git commit -m "$(cat <<'EOF'
test: run the smoke script against either genre

The chapter-range check now walks whatever *Chapter fields the bible
actually has instead of naming drama's four, so it covers the romance
spine's reveal and confrontation chapters without a second copy.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Chạy thật một truyện ngôn tình và viết tài liệu

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Chạy một truyện ngôn tình ngắn qua web UI**

`npm start`, tạo truyện mới: tên `thu-ngontinh`, thể loại **Ngôn tình sủng**, 3 chương, 3 cảnh/chương, thời lượng 15 phút, dán nội dung `stories/example-ngontinh/idea.txt`.

Chờ chạy xong, rồi kiểm:

```bash
npx tsx -e 'import fs from "node:fs/promises";const b=JSON.parse(await fs.readFile("output/thu-ngontinh/story_bible.json","utf8"));console.log("genreId:",b.genreId);console.log("has sweetLadder:",Array.isArray(b.sweetLadder),b.sweetLadder?.length);console.log("has escalationLadder:",("escalationLadder" in b))'
```
Expected: `genreId: ngontinh`, `has sweetLadder: true 8..12`, `has escalationLadder: false`.

```bash
head -c 400 output/thu-ngontinh/hook.txt
grep -c "Mời quý vị" output/thu-ngontinh/hook.txt || echo "no drama sign-off"
npx tsx -e 'import fs from "node:fs/promises";const r=JSON.parse(await fs.readFile("output/thu-ngontinh/run-info.json","utf8"));console.log(r.runs.at(-1).genre)'
```
Expected: hook mở bằng giọng "tôi"; `no drama sign-off`; run-info in `ngontinh`.

Đọc `output/thu-ngontinh/chapter-1.txt` bằng mắt và xác nhận: kể ngôi 1 xưng "tôi", có ít nhất một câu nội tâm tự trào, có đúng một câu thoại sát thương, không có bạo lực thân thể.

- [ ] **Step 2: Chấm điểm truyện đó**

Bấm **Chấm điểm** trên màn hình truyện. Chờ xong, rồi:

```bash
npx tsx -e 'import fs from "node:fs/promises";const r=JSON.parse(await fs.readFile("output/thu-ngontinh/review-report.json","utf8"));console.log("chapter keys:",Object.keys(r.chapters[0].scores));console.log("summary keys:",Object.keys(r.summary.scores))'
```
Expected: chapter keys là `hook,nhipDo,showKhongTell,hoiThoai,ngotNgao,namChinh`; summary keys là `cauTruc,vongCungNhanVat,caoTrao,ketThuc,doMoiLa,bamMoralMotif`.

Trên màn hình review: bảng điểm hiện `Độ ngọt` và `Nam chính`, không có `undefined`.

- [ ] **Step 3: Kiểm tra truyện drama cũ không bị ảnh hưởng**

Mở một truyện drama đã có sẵn từ trước trên web UI. Xác nhận: bảng home hiện `Drama gia đình`, màn hình review hiện đủ 6 nhãn cũ, điểm số hiển thị y như trước khi thay đổi.

- [ ] **Step 4: Viết tài liệu vào `CLAUDE.md`**

Thêm mục **Thể loại truyện (genre)** vào phần Architecture, đặt **trước** mục "Story generation pipeline", nội dung phải nêu:

- `src/prompts/` gồm `core.ts` (quy tắc craft dùng chung, hàm dựng prompt) + một file spine mỗi thể loại + `index.ts` (`getGenre`, `GENRES`).
- Hai thể loại: `drama` (mặc định) và `ngontinh`.
- Spine quyết định những gì: trường Story Bible, trường Outline, công thức Hook/Outro và số từ, `actsText`, khóa điểm `REVIEW_CH`, khóa chống lặp trong memory.
- Khóa `REVIEW_SUM` giống nhau ở mọi thể loại — có chủ ý, để `staleChapters`/`needsFix`/`scoreSum` và màn hình tổng hợp không phải biết thể loại.
- Thể loại được đóng dấu vào `story_bible.json` ở field **`genreId`** (không phải `genre` — `ARCH` đã sinh sẵn field `genre` dạng văn xuôi). `reviewStory`/`fixStory` đọc từ đó, nên chấm điểm chạy nhiều ngày sau vẫn đúng rubric; bible không có `genreId` đọc là `drama`.
- `POST /api/review|fix/:name` **không** nhận override thể loại (khác `provider`/`model`) vì thể loại thuộc về truyện đã viết.
- `POST /api/generate` trả `400` với thể loại lạ, trong khi `getGenre` fallback về drama — hai chỗ khác nhau có chủ ý.
- Cách thêm thể loại thứ ba: thêm một file spine, đăng ký vào `index.ts`, thêm nhãn vào `CRITERIA_LABELS`/`GENRE_LABELS` trong `public/app.js` nếu có khóa điểm mới.
- Golden-file snapshot: `npx tsx scripts/snapshot-prompts.ts <genre>` + `git diff` là cách duy nhất bắt được prompt bị đổi ngoài ý muốn khi refactor; `npx tsx scripts/check-genre-prompts.ts` assert các spine không lẫn vào nhau.

Cập nhật mục Commands: thêm `npx tsx scripts/smoke-prompts.ts [drama|ngontinh]`, `npx tsx scripts/snapshot-prompts.ts <genre>`, `npx tsx scripts/check-genre-prompts.ts`.

Cập nhật mục Config: thêm `Config.genre` và env `STORY_GENRE`, và ghi rõ `settings.json` có thể chứa `genre` làm mặc định cho form.

- [ ] **Step 5: Chạy lại toàn bộ cổng kiểm chứng lần cuối**

```bash
npx tsc --noEmit \
  && npx tsx scripts/check-genre-prompts.ts \
  && npx tsx scripts/snapshot-prompts.ts drama \
  && npx tsx scripts/snapshot-prompts.ts ngontinh \
  && git diff --exit-code scripts/__snapshots__/ \
  && echo "ALL GATES PASS"
```
Expected: `ALL GATES PASS`.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: document the genre spine architecture

Covers the two places genre resolution deliberately differs — getGenre
falls back to drama, POST /api/generate rejects an unknown value — and
why the genre lives in story_bible.json under genreId rather than in the
job config or the free-text genre field ARCH already emits.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage** — mọi mục của spec đã có task:

| Mục spec | Task |
|---|---|
| Tách module prompt (`core`/`drama`/`ngontinh`/`index`) | 3, 5 |
| Interface `GenrePrompts` | 3 |
| Spine ngôn tình — trường Story Bible | 5 (Step 3) |
| Spine ngôn tình — trường Outline | 5 (Step 4) |
| Spine ngôn tình — trường Scene | 5 (Step 5) |
| Spine ngôn tình — quy tắc viết `WR` | 5 (Step 6) |
| Spine ngôn tình — Hook/Outro | 5 (Step 7) |
| Spine ngôn tình — `EDIT`/`FIXCH` | 5 (Step 9) |
| Spine ngôn tình — `CHECK`/rubric | 5 (Step 8) |
| Bộ nhớ và chống lặp | 4 (Step 6), 5 (Step 9) |
| `Config.genre`, `GenreId`, settings override | 2 |
| Đóng dấu `genreId` vào bible; review/fix đọc lại | 4 (Step 2, Step 5) |
| `appendRunInfo` ghi genre | 4 (Step 4) |
| API `/api/config`, `/api/generate`, `/api/stories` | 6 |
| `/api/review|fix` **không** nhận genre override | 6 (không làm gì — ghi lại trong tài liệu ở Task 9) |
| UI dropdown, cột thể loại, nhãn tiêu chí | 7 |
| Smoke script nhận tham số thể loại | 8 |
| `stories/example-ngontinh/idea.txt` | 8 |
| Tương thích ngược (truyện cũ, report cũ) | 4 (Step 9), 7 (Step 7 mục 3), 9 (Step 3) |
| Kiểm chứng 1-7 của spec | 1, 3 (Step 6), 5 (Step 11-13), 8 (Step 4-5), 9 (Step 1-3, Step 5) |
| `src/ollama.ts` không đụng | — (không có task nào chạm, đúng chủ ý) |

**Type consistency** — tên dùng xuyên suốt, đã đối chiếu:

- `GenreId`, `Config.genre`, `getGenre(id?:string):GenrePrompts`, `GENRES:{id,label}[]`, `GenrePrompts` — Task 2/3 định nghĩa, Task 4/5/6/7/8 dùng đúng tên.
- Trường bible: `genreId` (không phải `genre`) ở Task 4, 6, 9 — nhất quán.
- `bibleRequired`, `chapterCriteria`, `usedMemoryKeys`, `hookWords`, `outroWords`, `actsText` — khai báo ở Task 3, dùng ở Task 4, assert ở Task 5.
- Khóa memory mới `usedSweetBeats`/`usedDoubtBeats`/`usedSwoonLines` — thêm vào `dedupeMemoryArrays` ở Task 4 Step 6, khai trong `usedMemoryKeys` và mô tả trong `MEM` ở Task 5 Step 9; `check-genre-prompts.ts` assert hai nơi khớp nhau.
- `criteriaLabel`/`criteriaKeys`/`CRITERIA_LABELS`/`GENRE_LABELS` — chỉ Task 7 dùng.

**Rủi ro đã có chốt chặn:** Task 3 là chỗ dễ làm hỏng thể loại drama nhất; cổng là diff byte-identical với baseline commit ở Task 1, và Task 4 lẫn Task 5 đều chạy lại diff đó.

**Chỗ cần LLM chạy được:** Task 8 Step 4-5 và toàn bộ Task 9. Các task còn lại kiểm chứng được hoàn toàn offline.
