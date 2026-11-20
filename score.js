/*
 * Failover Score: logika skor dan hitungan buat Report.
 * Dipakai halaman kuis (app.js) dan Lead Desk (admin.js), jadi angkanya selalu sama.
 * Semua fungsi di sini murni: nggak nyentuh layar, nggak nyimpen apa-apa.
 * Kalau mau ganti pertanyaan, poin, atau batas status, ubahnya di file ini aja.
 */
(function (root) {
  "use strict";

  /* ---------- pertanyaan ---------- */
  const QUESTIONS = [
    {layer:"income", short:"Sumber pemasukan", title:"Pemasukan rumah tangga datang dari berapa sumber?", help:"Misalnya gaji kamu, gaji pasangan, atau usaha sampingan.", why:"Makin banyak sumber, makin stabil kalau salah satunya lagi sepi.", max:14, opts:[["1 sumber",0],["2 sumber",10],["Lebih dari 2",14]]},
    {layer:"income", short:"Tanggungan", title:"Ada berapa orang yang biaya hidupnya kamu tanggung?", help:"Pasangan, anak, orang tua, atau saudara seperti adik dan keponakan.", why:"Ini bukan nilai jelek, kok. Cuma buat tahu seberapa besar backup yang pas buat keluargamu.", max:14, opts:[["Belum ada",14],["1 orang",9],["2–3 orang",5],["4 orang atau lebih",2]]},
    {layer:"ef", short:"Emergency fund", title:"Kalau pemasukan lagi sepi, tabunganmu cukup buat berapa bulan?", help:"Hitung dari pengeluaran bulanan termasuk cicilan, bukan dari gaji.", why:"Emergency fund itu backup pertama, sebelum asuransi apa pun.", max:16, opts:[["Kurang dari 1 bulan",0],["1–3 bulan",6],["3–6 bulan",12],["Lebih dari 6 bulan",16]]},
    {layer:"health", short:"BPJS Kesehatan", title:"BPJS Kesehatan kamu aktif?", help:"Kalau ragu, cek di aplikasi Mobile JKN.", why:"BPJS itu fondasi paling murah buat biaya kesehatan.", max:10, opts:[["Aktif",10],["Nggak aktif",0],["Nggak yakin",3]]},
    {layer:"health", short:"Asuransi kesehatan", title:"Selain BPJS, kamu punya asuransi kesehatan?", help:"Asuransi dari kantor biasanya berhenti kalau kamu pindah kerja.", why:"Biar biaya rumah sakit nggak perlu ngambil dari tabungan.", max:12, opts:[["Belum ada",0],["Ada, dari kantor",6],["Ada, punya sendiri",12]]},
    {layer:"income", short:"Asuransi jiwa", title:"Kamu udah punya asuransi jiwa?", help:"Asuransi jiwa jadi backup pemasukan buat keluarga.", why:"Ini yang bikin rencana keluarga tetap jalan, apa pun yang terjadi.", max:14, opts:[["Belum ada",0],["Ada, dari kantor",5],["Ada, punya sendiri",14]]},
    {layer:"ef", short:"Cicilan", title:"Ada cicilan besar, misalnya rumah atau kendaraan?", help:"Kartu kredit dan paylater juga dihitung.", why:"Cicilan tetap jalan tiap bulan, jadi perlu masuk hitungan backup.", max:10, opts:[["Nggak ada",10],["Ada, di bawah 30% pemasukan",6],["Ada, 30% pemasukan atau lebih",2]]},
    {layer:"income", short:"Status kerja", title:"Status kerjamu sekarang?", help:"Pilih yang paling mendekati.", why:"Pemasukan freelance lebih naik-turun, jadi backup-nya perlu sedikit lebih tebal.", max:10, opts:[["Karyawan tetap",10],["Karyawan kontrak",6],["Freelance atau usaha sendiri",4]]}
  ];

  /* dari atas ke bawah: atap, dinding, fondasi */
  const LAYERS = [
    {key:"income", name:"Income protection", qs:[0,1,5,7], max:52},
    {key:"health", name:"Health protection", qs:[3,4], max:22},
    {key:"ef", name:"Emergency fund", qs:[2,6], max:26}
  ];

  const INCOME = [["lt10","Di bawah Rp10 juta"],["10-15","Rp10–15 juta"],["15-25","Rp15–25 juta"],["gt25","Di atas Rp25 juta"]];
  const BUDGET = {"lt10":"di bawah Rp1 juta per bulan","10-15":"sekitar Rp1–1,5 juta per bulan","15-25":"sekitar Rp1,5–2,5 juta per bulan","gt25":"di atas Rp2,5 juta per bulan"};
  const COMMUTE = [["wfh","WFH / hybrid"],["lt30","Kurang dari 30 menit"],["30-60","30–60 menit"],["1-2","1–2 jam"],["gt2","Lebih dari 2 jam"]];
  const DEBT_TYPES = [["kpr","Rumah (KPR)"],["kendaraan","Kendaraan"],["kk","Kartu kredit / paylater"],["lain","Lainnya"]];
  const PREF = [["konven","Konvensional"],["syariah","Syariah"],["belum","Belum tahu"]];

  /* ---------- isi form kosong ---------- */
  function mkDebt(on, monthly, dur, unit){ return {on:!!on, monthly:monthly || 0, dur:dur || 1, unit:unit || "tahun"}; }
  function blankDebts(){ return {kpr:mkDebt(), kendaraan:mkDebt(), kk:mkDebt(), lain:mkDebt()}; }
  function noDeps(none){ return {pasangan:false, anak:false, orangtua:false, saudara:false, none:!!none}; }
  function blankForm(){
    return {name:"", age:"", spouse:"pasangan", deps:noDeps(false), kids:1, youngest:1, sibs:1, sibYoungest:10,
      income:null, expense:0, debts:blankDebts(), noDebt:false, savings:0, pref:null, commute:null, consent:false};
  }

  /* ---------- format angka ---------- */
  function num(v, d){ return Number(v).toLocaleString("id-ID", {maximumFractionDigits:d}); }
  function rp(n){
    n = Math.round(n || 0); const a = Math.abs(n);
    if (a >= 1e9) return "Rp" + num(n / 1e9, 2) + " miliar";
    if (a >= 1e6) return "Rp" + num(n / 1e6, 1) + " juta";
    if (a >= 1e3) return "Rp" + num(n / 1e3, 0) + " ribu";
    return "Rp" + num(n, 0);
  }
  function approx(n){
    if (n <= 0) return "Rp0";
    let r;
    if (n >= 1e9) r = Math.round(n / 1e8) * 1e8;
    else if (n >= 1e8) r = Math.round(n / 5e7) * 5e7;
    else r = Math.max(5e6, Math.round(n / 5e6) * 5e6);
    return "±" + rp(r);
  }
  function joinID(list){ if (list.length <= 1) return list.join(""); return list.slice(0, -1).join(", ") + " dan " + list[list.length - 1]; }
  function cap(s){ return s.charAt(0).toUpperCase() + s.slice(1); }
  function efText(ef){ return ef < 1 ? "kurang dari 1 bulan" : "sekitar " + Math.round(ef) + " bulan"; }

  /* ---------- skor ---------- */
  /* Q6 (asuransi jiwa) otomatis penuh kalau belum ada tanggungan, karena memang belum perlu. */
  function pts(ans, i){ const a = ans[i]; if (a == null) return null; if (i === 5 && ans[1] === 0) return 14; return QUESTIONS[i].opts[a][1]; }
  function complete(ans){ return Array.isArray(ans) && ans.length === 8 && ans.every(a => a != null); }
  function score(ans){ return complete(ans) ? QUESTIONS.reduce((s, q, i) => s + pts(ans, i), 0) : null; }
  function layerVals(ans){ const v = {}; LAYERS.forEach(L => { v[L.key] = L.qs.reduce((s, i) => s + (pts(ans, i) || 0), 0) / L.max; }); return v; }
  function layerStatus(v){ return v >= .75 ? {cls:"good", label:"Kuat"} : v >= .5 ? {cls:"mid", label:"Cukup"} : {cls:"low", label:"Perlu diperkuat"}; }
  function status(sc){
    if (sc >= 70) return {label:"Solid", low:false, share:"Backup-ku udah kuat. Tinggal dijaga."};
    if (sc >= 40) return {label:"Almost there", low:false, share:"Fondasinya udah ada. Lagi aku perkuat pelan-pelan."};
    return {label:"Needs backup", low:true, share:"Baru mulai nyusun backup. Pelan-pelan, yang penting jalan."};
  }

  /* 3 hal yang paling banyak kehilangan poin. Q2 (tanggungan) nggak ikut, karena itu bukan sesuatu yang perlu "diperbaiki". */
  const PRIO = [2,5,4,3,0,6,7];
  function weak(ans){
    const c = [];
    [0,2,3,4,5,6,7].forEach(i => { const m = QUESTIONS[i].max - pts(ans, i); if (m > 0) c.push({i, m}); });
    c.sort((a, b) => b.m - a.m || PRIO.indexOf(a.i) - PRIO.indexOf(b.i));
    return c.slice(0, 3);
  }
  const WEAK_COPY = {
    0:[["Pemasukan masih dari 1 sumber","Wajar banget. Backup-nya bisa dari emergency fund dan proteksi pemasukan."],["Pemasukan dari 2 sumber","Udah lumayan stabil. Tinggal pastikan backup-nya ikut kuat."]],
    2:[["Emergency fund kurang dari 1 bulan","Mulai dari target 1 bulan dulu, lalu naik ke 3 bulan. Dicicil pelan-pelan juga nggak apa-apa."],["Emergency fund 1–3 bulan","Patokannya 3–6 bulan pengeluaran. Bisa dicicil pelan-pelan."],["Emergency fund 3–6 bulan","Udah bagus. Kalau pemasukan naik-turun, 6 bulan bikin lebih tenang."]],
    3:[null,["BPJS Kesehatan belum aktif","Ini fondasi paling murah buat biaya kesehatan. Cek caranya di Mobile JKN."],["Status BPJS belum pasti","Cek di Mobile JKN, cuma butuh 2 menit."]],
    4:[["Belum ada asuransi kesehatan selain BPJS","Biar biaya rumah sakit nggak ngambil dari tabungan."],["Asuransi kesehatan masih dari kantor","Aman selama kamu masih kerja di sana. Cek lagi kalau nanti pindah kerja."]],
    5:[["Belum ada asuransi jiwa","Ada yang bergantung ke pemasukanmu. Ini yang jaga rencana mereka tetap jalan."],["Asuransi jiwa masih dari kantor","Aman selama kamu masih kerja di sana. Cek lagi kalau nanti pindah kerja."]],
    6:[null,["Ada cicilan, di bawah 30% pemasukan","Masih sehat. Pastikan sisa cicilannya ikut dihitung di backup."],["Cicilan 30% pemasukan atau lebih","Selama lancar nggak masalah, tapi emergency fund jadi makin penting."]],
    7:[null,["Status kerja kontrak","Pemasukan bisa berubah saat kontrak selesai. Emergency fund jadi backup utamanya."],["Pemasukan freelance naik-turun","Backup-nya perlu sedikit lebih tebal, idealnya 6 bulan."]]
  };
  function weakCopy(ans, i){ return WEAK_COPY[i][ans[i]]; }

  function safeList(ans){
    const s = [];
    if (ans[0] === 2) s.push("Pemasukan dari 3+ sumber");
    if (ans[2] === 3) s.push("Emergency fund 6+ bulan");
    if (ans[3] === 0) s.push("BPJS Kesehatan aktif");
    if (ans[4] === 2) s.push("Asuransi kesehatan sendiri");
    if (ans[5] === 2 && ans[1] !== 0) s.push("Asuransi jiwa sendiri");
    if (ans[6] === 0) s.push("Nggak ada cicilan");
    if (ans[7] === 0) s.push("Pekerjaan tetap");
    return s;
  }

  function firstStep(ans){
    const hasDep = ans[1] !== 0;
    if (ans[3] !== 0) return "Aktifkan BPJS Kesehatan, atau cek statusnya di Mobile JKN. Ini fondasi paling murah.";
    if (ans[2] <= 1) return "Tambah emergency fund sampai 3 bulan pengeluaran. Nggak perlu beli apa-apa dulu.";
    if (ans[4] === 0) return "Cari tahu asuransi kesehatan yang muat di budget, biar biaya rumah sakit nggak ngambil dari tabungan.";
    if (hasDep && ans[5] === 1) return "Tanya HR berapa nilai asuransi jiwa dari kantor, lalu bandingkan sama kebutuhan keluargamu.";
    if (hasDep && ans[5] === 0) return "Hitung berapa backup pemasukan yang dibutuhkan keluargamu. Report gratis di bawah bisa bantu.";
    if (ans[2] === 2 && ans[7] !== 0) return "Lanjutkan emergency fund sampai 6 bulan, karena pemasukanmu lebih naik-turun.";
    return "Backup-mu udah kuat. Cukup cek lagi setahun sekali, atau tiap ada perubahan besar.";
  }

  /* Jawaban skor yang otomatis kebawa ke form (tanggungan dan cicilan). */
  function syncForm(ans, f){
    if (ans[1] === 0) f.deps = noDeps(true); else if (f.deps.none) f.deps.none = false;
    if (ans[6] === 0){ f.noDebt = true; Object.keys(f.debts).forEach(k => { f.debts[k].on = false; }); }
    else if (f.noDebt) f.noDebt = false;
    return f;
  }

  /* ---------- hitungan buat Report ----------
   * Emergency fund = tabungan / (pengeluaran + cicilan)
   * Kebutuhan backup = pengeluaran x 12 x lama backup + sisa cicilan - tabungan
   * Lama backup = sampai tanggungan paling kecil (anak, adik, keponakan) umur 22, atau 5 tahun kalau nggak ada yang di bawah 22
   */
  function derive(f){
    const debtsIn = f.debts || blankDebts();
    const deps = f.deps || noDeps(false);
    const debts = f.noDebt ? [] : DEBT_TYPES.filter(([k]) => debtsIn[k] && debtsIn[k].on).map(([k, label]) => {
      const d = debtsIn[k], months = d.unit === "tahun" ? d.dur * 12 : d.dur, monthly = +d.monthly || 0;
      return {k, label, monthly, months, dur:d.dur, unit:d.unit, remaining:monthly * months};
    });
    const debtMonthly = debts.reduce((s, d) => s + d.monthly, 0);
    const remaining = debts.reduce((s, d) => s + d.remaining, 0);
    const expense = +f.expense || 0, savings = +f.savings || 0, outflow = expense + debtMonthly;
    const ef = outflow ? savings / outflow : 0;
    const depList = [], careDeps = [];
    if (!deps.none){
      if (deps.pasangan){ depList.push(f.spouse || "pasangan"); careDeps.push(f.spouse || "pasangan"); }
      if (deps.anak){ const a = f.kids > 1 ? f.kids + " anak" : "anak"; depList.push(a); careDeps.push(a); }
      if (deps.saudara) depList.push(f.sibs > 1 ? f.sibs + " saudara" : "saudara");
      if (deps.orangtua) depList.push("orang tua");
    }
    const hasDeps = depList.length > 0;
    const young = [];
    if (!deps.none && deps.anak && f.youngest < 22) young.push(["anak", f.youngest]);
    if (!deps.none && deps.saudara && f.sibYoungest < 22) young.push(["adik atau keponakan", f.sibYoungest]);
    let years = 0, yearsWhy = "", youngLabel = "";
    if (hasDeps){
      if (young.length){
        const min = Math.min.apply(null, young.map(y => y[1]));
        youngLabel = young.length > 1 ? "yang paling kecil" : young[0][0];
        years = Math.max(1, 22 - min);
        yearsWhy = (young.length > 1 ? "tanggungan" : young[0][0]) + " paling kecil sekarang " + min + " tahun, sampai umur 22 (kira-kira lulus kuliah)";
      } else {
        years = 5;
        yearsWhy = deps.pasangan ? "nggak ada tanggungan di bawah 22 tahun, jadi dihitung 5 tahun masa transisi buat " + (f.spouse || "pasangan") : "dihitung 5 tahun masa transisi buat keluarga";
      }
    }
    const base = expense * 12 * years, need = base + remaining - savings, kpr = debts.find(d => d.k === "kpr");
    return {debts, debtMonthly, remaining, expense, savings, outflow, ef, deps:depList, careDeps, hasDeps, years, yearsWhy, youngLabel, base, need, kpr};
  }

  /* ---------- prioritas lead di Lead Desk ----------
   * Patokan kasar buat milih siapa yang di-chat duluan, dari kecocokan sama target (keluarga muda, pemasukan lumayan)
   * dan seberapa besar kebutuhannya. Cuma buat urutan kerja, bukan penilaian orangnya.
   * Poin: pemasukan 0–3, ada tanggungan tapi belum punya asuransi jiwa sendiri 1–2,
   *       belum ada asuransi kesehatan selain BPJS 1, anak paling kecil umur 5 ke bawah 1, ada KPR 1.
   * 5 poin ke atas = Prioritas, 3–4 = Potensial, di bawah 3 = Edukasi dulu.
   */
  const INCOME_PTS = {"lt10":0, "10-15":1, "15-25":2, "gt25":3};
  function priority(ans, f){
    const d = derive(f), deps = f.deps || noDeps(false), why = [];
    let p = 0;
    const ip = INCOME_PTS[f.income] || 0;
    if (ip){ p += ip; why.push("pemasukan " + INCOME.find(x => x[0] === f.income)[1].replace(/^Di /, "di ")); }
    if (d.hasDeps && ans[5] === 0){ p += 2; why.push("ada tanggungan, belum punya asuransi jiwa"); }
    else if (d.hasDeps && ans[5] === 1){ p += 1; why.push("ada tanggungan, asuransi jiwa masih dari kantor"); }
    if (ans[4] === 0){ p += 1; why.push("belum ada asuransi kesehatan selain BPJS"); }
    if (!deps.none && deps.anak && f.youngest <= 5){ p += 1; why.push(f.youngest < 1 ? "punya bayi" : "anak paling kecil umur " + f.youngest); }
    if (d.kpr){ p += 1; why.push("ada KPR"); }
    const level = p >= 5 ? "high" : p >= 3 ? "mid" : "low";
    return {level, label:{high:"Prioritas", mid:"Potensial", low:"Edukasi dulu"}[level], pts:p, why};
  }

  const FS = {QUESTIONS, LAYERS, INCOME, BUDGET, COMMUTE, DEBT_TYPES, PREF,
    mkDebt, blankDebts, noDeps, blankForm, syncForm,
    num, rp, approx, joinID, cap, efText,
    pts, complete, score, layerVals, layerStatus, status, weak, weakCopy, safeList, firstStep, derive, priority};

  if (typeof module !== "undefined" && module.exports) module.exports = FS;
  else root.FS = FS;
})(typeof window !== "undefined" ? window : globalThis);
