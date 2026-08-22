// Khẳng định dải chuẩn trong src/craft.ts vẫn đo đúng cái nó sinh ra để đo.
//
// Mẫu không phải do tôi bịa: scripts/__fixtures__/craft-reference.json là SỐ ĐO THẬT của
// bốn truyện kênh Mây Trắng Audio (mẫu DƯƠNG — dải phải nhận hết) và của bốn truyện chính
// repo này đã sinh ra (mẫu ÂM — dải phải loại hết). Chỉ có số, không có văn bản gốc: bản ghi
// lời của người khác không thuộc về repo này, và cái cần kiểm là con số chứ không phải câu chữ.
//
// Khẳng định nặng nhất là mẫu ÂM. Một dải rộng đến mức cái gì cũng lọt thì vẫn xanh ở mẫu
// dương và vô dụng hoàn toàn — nó sẽ báo "đạt chuẩn" cho đúng những truyện mà việc này sinh
// ra để bắt. Phép thử khi sửa dải: nới AVG_MAX lên 30 phải làm script này đỏ.
import fs from "node:fs";
import {measureCraft, gradeCraft, AVG_MIN, AVG_MAX, type CraftMetrics, type CraftTarget} from "../src/craft.js";
import {getGenre} from "../src/prompts/index.js";

const fails: string[] = [];
const must = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

const fx = JSON.parse(fs.readFileSync("scripts/__fixtures__/craft-reference.json", "utf8")) as {
  reference: {id: string; title: string; coldOpen: CraftMetrics; story: CraftMetrics}[];
  pipeline: {name: string; story: CraftMetrics}[];
};

must(fx.reference.length === 4, `fixture should hold 4 reference stories, has ${fx.reference.length}`);
must(fx.pipeline.length >= 4, `fixture should hold at least 4 pipeline stories, has ${fx.pipeline.length}`);

// Mục tiêu của thể loại hồi quy chính là chỗ bốn bản đang đứng, nên chúng phải sạch tuyệt đối.
const hq = getGenre("hoiquy");
const target: CraftTarget = {words: 8000, narration: hq.narration, hookWords: hq.hookWords, outroWords: hq.outroWords};
must(hq.id === "hoiquy", "getGenre('hoiquy') fell back — spine not registered, the whole band is measuring nothing");
must(hq.narration === "first", "hoiquy must declare first-person narration — all four references are first person");

for (const r of fx.reference) {
  const v = gradeCraft(r.story, target);
  must(v.ok, `dải loại chính bản chuẩn "${r.title.slice(0, 40)}": ${v.violations.join("; ")}`);
  // Lời dẫn của bốn bản: 185-271 từ. Trần của spine phải ôm được cả bốn, nếu không thì
  // chính truyện mẫu cũng bị ghi lỗi lời dẫn.
  const hv = gradeCraft(r.story, target, r.coldOpen);
  must(hv.ok, `dải loại lời dẫn của bản chuẩn "${r.title.slice(0, 40)}" (${r.coldOpen.words} từ): ${hv.violations.join("; ")}`);
}

// Mẫu âm: mỗi truyện pipeline phải phạm ÍT NHẤT MỘT dải. Đo theo mục tiêu độ dài của chính
// nó (14.400 từ cho cấu hình 60 phút) để lỗi bắt được là lỗi NHỊP và NGÔI KỂ, không phải lỗi
// độ dài — nếu chỉ độ dài sai thì dải này chẳng chứng minh được gì mà một phép trừ cũng làm được.
const asFirst: CraftTarget = {words: 14400, narration: "first", hookWords: 240, outroWords: 40};
for (const p of fx.pipeline) {
  const v = gradeCraft(p.story, asFirst);
  const beyondLength = v.violations.filter(x => !x.startsWith("truyện dài") && !x.startsWith("truyện ngắn"));
  must(beyondLength.length > 0,
    `dải nhận truyện pipeline "${p.name.slice(0, 40)}" là đạt chuẩn — dải đang quá rộng để có ích`);
}

// Hai truyện hỏng theo HAI PHÍA NGƯỢC NHAU. Đây là lý do dải phải có hai đầu chứ không phải
// một ngưỡng: mọi luật một chiều đều chữa được một trong hai và làm nặng thêm cái còn lại.
const choppy = fx.pipeline.find(p => p.story.avgSentence < AVG_MIN);
const tangled = fx.pipeline.find(p => p.story.avgSentence > AVG_MAX);
must(!!choppy, `fixture lost its choppy sample — nothing below ${AVG_MIN} words/sentence`);
must(!!tangled, `fixture lost its tangled sample — nothing above ${AVG_MAX} words/sentence`);
if (choppy) must(gradeCraft(choppy.story, asFirst).violations.some(v => v.includes("quá vụn")),
  `"${choppy.name}" measures ${choppy.story.avgSentence} words/sentence but is not reported as choppy`);
if (tangled) must(gradeCraft(tangled.story, asFirst).violations.some(v => v.includes("quá rối")),
  `"${tangled.name}" measures ${tangled.story.avgSentence} words/sentence but is not reported as tangled`);

// measureCraft đo đúng thứ nó nói là đang đo. Bốn mẫu nhỏ dưới đây viết tay, cố ý cực đoan.
const m1 = measureCraft("Tôi bước vào nhà. Tôi ngồi xuống ghế. Bà nhìn tôi.");
must(m1.sentences === 3 && m1.words === 11, `measureCraft đếm sai: ${m1.sentences} câu / ${m1.words} từ, phải là 3/11`);
must(m1.firstPersonPct === 66.7, `câu mở bằng "Tôi " phải là 66,7%, đo được ${m1.firstPersonPct}%`);
// Câu thoại mở bằng "Tôi" KHÔNG được tính là giọng người kể — đây là chỗ dễ đo nhầm nhất,
// vì một truyện ngôi thứ ba đầy thoại sẽ giả dạng thành ngôi thứ nhất.
const m2 = measureCraft(`Bà đặt bát xuống. "Tôi không đi đâu cả." Ông quay mặt đi.`);
must(m2.firstPersonPct === 0, `câu thoại "Tôi không đi đâu cả." bị tính thành giọng người kể (${m2.firstPersonPct}%)`);
const m3 = measureCraft("Ba ngày sau, bà quay lại. Một năm sau nữa, nhà đã bán. Hôm sau thì trời mưa.");
must(m3.timeJumps === 2, `nhảy thời gian phải đếm được 2 ("Ba ngày sau", "Một năm sau"), đo được ${m3.timeJumps}`);
const m4 = measureCraft("Cô đi đâu? Sao lại là tôi? Không ai trả lời.");
must(m4.questionsPer1000 > 0 && m4.questionsPer1000 === Math.round((2 / m4.words) * 10000) / 10,
  `mật độ dấu hỏi tính sai: ${m4.questionsPer1000}`);

// Thể loại kể ngôi thứ ba không được bị ghi lỗi vì đúng cái nó cố ý làm.
const third = gradeCraft({...fx.reference[0].story, firstPersonPct: 0}, {...target, narration: "third"});
must(!third.violations.some(v => v.includes("ngôi thứ nhất")),
  "một spine khai narration='third' vẫn bị ghi lỗi trôi khỏi ngôi thứ nhất");
const first = gradeCraft({...fx.reference[0].story, firstPersonPct: 0}, target);
must(first.violations.some(v => v.includes("ngôi thứ nhất")),
  "spine khai narration='first' mà truyện không còn câu 'Tôi ' nào vẫn được cho qua");

if (fails.length) { console.error("CRAFT BAND FAILURES:\n" + fails.map(f => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`craft band OK (${fx.reference.length} bản chuẩn lọt dải, ${fx.pipeline.length} truyện pipeline bị loại)`);
