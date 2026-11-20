// Jalankan: node tests/score.test.js
// Ngecek score.js pakai 3 skenario dari simulator. Kalau kamu ngubah poin atau pertanyaan, update angka di sini juga.
const assert = require("node:assert/strict");
const FS = require("../score.js");

function form(over){ return Object.assign(FS.blankForm(), over); }
const debtsWithKpr = Object.assign(FS.blankDebts(), {kpr: FS.mkDebt(true, 4000000, 8, "tahun")});

const SCENARIOS = [
  {
    name: "Skenario 1: fresh starter, ngekos",
    ans: [0,0,0,0,1,0,0,1],
    form: form({name:"Dimas", age:"24", deps:FS.noDeps(true), income:"lt10", expense:4500000, noDebt:true, savings:3000000, commute:"30-60", pref:"konven"}),
    expect: {score:60, status:"Almost there", layers:{income:34/52, health:16/22, ef:10/26}, efMonths:0.67, years:0, need:"Rp0", hasDeps:false}
  },
  {
    name: "Skenario 2: baru nikah, ngekos dekat kantor",
    ans: [0,1,1,0,1,1,0,0],
    form: form({name:"Fajar", age:"27", spouse:"istri", deps:{pasangan:true, anak:false, orangtua:false, saudara:false, none:false}, income:"10-15", expense:7000000, noDebt:true, savings:15000000, commute:"lt30", pref:"belum"}),
    expect: {score:56, status:"Almost there", layers:{income:24/52, health:16/22, ef:16/26}, efMonths:2.14, years:5, need:"±Rp400 juta", hasDeps:true}
  },
  {
    name: "Skenario 3: keluarga muda, commute dan KPR",
    ans: [0,2,1,0,1,1,1,0],
    form: form({name:"Raka", age:"32", spouse:"istri", deps:{pasangan:true, anak:true, orangtua:false, saudara:false, none:false}, kids:1, youngest:2, income:"15-25", expense:9000000, debts:debtsWithKpr, noDebt:false, savings:25000000, commute:"1-2", pref:"syariah"}),
    expect: {score:48, status:"Almost there", layers:{income:20/52, health:16/22, ef:12/26}, efMonths:1.92, years:20, need:"±Rp2,5 miliar", hasDeps:true}
  }
];

let passed = 0;
for (const sc of SCENARIOS){
  const d = FS.derive(sc.form);
  const L = FS.layerVals(sc.ans);
  assert.equal(FS.score(sc.ans), sc.expect.score, sc.name + ": score");
  assert.equal(FS.status(FS.score(sc.ans)).label, sc.expect.status, sc.name + ": status");
  for (const k of ["income","health","ef"]) assert.ok(Math.abs(L[k] - sc.expect.layers[k]) < 1e-9, sc.name + ": lapis " + k);
  assert.equal(d.ef.toFixed(2), sc.expect.efMonths.toFixed(2), sc.name + ": emergency fund");
  assert.equal(d.years, sc.expect.years, sc.name + ": lama backup");
  assert.equal(d.hasDeps, sc.expect.hasDeps, sc.name + ": tanggungan");
  assert.equal(d.hasDeps ? FS.approx(d.need) : "Rp0", sc.expect.need, sc.name + ": kebutuhan backup");
  passed++;
  console.log("lulus  " + sc.name + "  (score " + FS.score(sc.ans) + ")");
}

// Q6 otomatis penuh kalau belum ada tanggungan
assert.equal(FS.pts([0,0,0,0,0,0,0,0], 5), 14, "Q6 penuh tanpa tanggungan");
assert.equal(FS.pts([0,1,0,0,0,0,0,0], 5), 0, "Q6 nol kalau ada tanggungan dan belum punya asuransi jiwa");
// skor belum keluar kalau masih ada yang kosong
assert.equal(FS.score([0,0,0,0,0,0,0,null]), null, "skor null kalau belum lengkap");
// skor maksimal 100
assert.equal(FS.score([2,0,3,0,2,2,0,0]), 100, "skor maksimal 100");
// KPR ikut masuk sisa cicilan: 4 juta x 96 bulan
assert.equal(FS.derive(SCENARIOS[2].form).remaining, 384000000, "sisa KPR");
passed += 5;

// Prioritas lead di Lead Desk
const prio = sc => FS.priority(sc.ans, sc.form);
assert.equal(prio(SCENARIOS[0]).label, "Edukasi dulu", "prioritas skenario 1");
assert.equal(prio(SCENARIOS[1]).label, "Edukasi dulu", "prioritas skenario 2");
assert.equal(prio(SCENARIOS[2]).label, "Prioritas", "prioritas skenario 3");
assert.equal(prio(SCENARIOS[2]).pts, 5, "poin prioritas skenario 3");
assert.deepEqual(prio(SCENARIOS[2]).why, ["pemasukan Rp15–25 juta", "ada tanggungan, asuransi jiwa masih dari kantor", "anak paling kecil umur 2", "ada KPR"], "alasan prioritas skenario 3");
const rich = {ans:[1,2,1,0,0,0,1,0], form:form({deps:{pasangan:true, anak:true, orangtua:false, saudara:false, none:false}, kids:1, youngest:0, income:"gt25", expense:15000000})};
assert.equal(prio(rich).pts, 7, "keluarga muda pemasukan tinggi tanpa proteksi");
assert.ok(prio(rich).why.includes("punya bayi"), "bayi di bawah 1 tahun");
passed += 7;

console.log("\nSemua " + passed + " cek lulus.");
