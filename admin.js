/*
 * Lead Desk: halaman admin Failover Score.
 * Login pakai akun Supabase. Cuma akun yang ada di tabel admins yang bisa lihat data.
 * Semua hitungan diambil dari score.js, jadi sama persis dengan yang dilihat pengunjung.
 */
(function () {
  "use strict";

  const CFG = Object.assign({OWNER_NAME:"Bayu", REPORT_WORKDAYS:2}, window.FS_CONFIG || {});
  const {QUESTIONS, LAYERS, INCOME, BUDGET, COMMUTE, DEBT_TYPES, PREF} = window.FS;
  const STATUS = [["baru","Baru"],["dihubungi","Dihubungi"],["report_dikirim","Report dikirim"],["check_up","Check-up"],["proposal","Proposal"],["closing","Closing"],["belum_sekarang","Belum sekarang"]];
  const OPEN = {baru:1, dihubungi:1};        // status yang masih nunggu Report

  const $root = document.getElementById("root"), $toast = document.getElementById("toast");
  const $who = document.getElementById("who"), $whoEmail = document.getElementById("who-email");
  const V = {view:"loading", leads:[], sel:null, filter:"all", q:"", open:false, confirmDel:false, busy:false, err:null, savedAt:null, draft:null,
    recap:{days:7, rows:null, busy:false, err:null, open:recapPref()}};
  function recapPref(){ try { return localStorage.getItem("fs_recap_open") !== "0"; } catch (e) { return true; } }

  /* ---------- helpers ---------- */
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  const statusLabel = k => (STATUS.find(s => s[0] === k) || [k, k])[1];
  const label = (list, k) => (list.find(x => x[0] === k) || [k, "–"])[1];
  function toast(msg){ $toast.textContent = msg; $toast.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { $toast.hidden = true; }, 2600); }
  function addWorkdays(d, n){ const x = new Date(d); while (n > 0){ x.setDate(x.getDate() + 1); const w = x.getDay(); if (w !== 0 && w !== 6) n--; } x.setHours(23, 59, 59, 0); return x; }
  function when(d){ return new Date(d).toLocaleString("id-ID", {day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit"}); }
  function rel(d){
    const m = Math.round((Date.now() - new Date(d)) / 60000);
    if (m < 1) return "baru aja";
    if (m < 60) return m + " menit lalu";
    if (m < 1440) return Math.round(m / 60) + " jam lalu";
    if (m < 10080) return Math.round(m / 1440) + " hari lalu";
    return new Date(d).toLocaleDateString("id-ID", {day:"numeric", month:"short"});
  }
  function due(lead){ return addWorkdays(lead.created_at, +CFG.REPORT_WORKDAYS || 2); }
  function isLate(lead){ return OPEN[lead.status] && Date.now() > due(lead); }
  function formOf(lead){
    const f = Object.assign(FS.blankForm(), lead.form || {});
    f.deps = Object.assign(FS.noDeps(false), (lead.form || {}).deps || {});
    f.debts = Object.assign(FS.blankDebts(), (lead.form || {}).debts || {});
    f.name = lead.name; f.age = lead.age == null ? "" : String(lead.age);
    return f;
  }
  const ansOf = lead => (lead.answers || []).map(a => (a == null ? null : +a));
  const prioOf = lead => FS.priority(ansOf(lead), formOf(lead));
  function prioPill(p){ return p.level === "high" ? '<span class="pill prio-high">Prioritas</span>' : p.level === "mid" ? '<span class="pill prio-mid">Potensial</span>' : ""; }

  /* ---------- data ---------- */
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_KEY || !window.supabase){
    V.view = "noconfig"; render(); return;
  }
  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);

  async function start(){
    const {data} = await sb.auth.getSession();
    if (data && data.session) await afterLogin(data.session.user); else { V.view = "login"; render(); }
  }
  async function afterLogin(user){
    $who.hidden = false; $whoEmail.textContent = user.email || "";
    const {data:ok, error} = await sb.rpc("is_admin");
    if (error || !ok){ V.view = "denied"; render(); return; }
    V.view = "desk"; await Promise.all([load(), loadRecap()]);
  }
  async function load(){
    V.busy = true; render();
    const {data, error} = await sb.from("leads").select("*").order("created_at", {ascending:false}).limit(500);
    V.busy = false;
    if (error){ V.err = "Gagal ambil data: " + error.message; render(); return; }
    V.err = null; V.leads = data || [];
    if (V.sel && !V.leads.some(l => l.id === V.sel)) V.sel = null;
    render();
  }
  async function loadRecap(){
    V.recap.busy = true; render();
    const {data, error} = await sb.rpc("funnel_summary", {p_days:V.recap.days});
    V.recap.busy = false;
    if (error){ V.recap.err = "Gagal ambil rekap: " + error.message; V.recap.rows = null; }
    else { V.recap.err = null; V.recap.rows = data || []; }
    render();
  }
  async function save(){
    const lead = V.leads.find(l => l.id === V.sel); if (!lead) return;
    const status = document.getElementById("d-status").value, notes = document.getElementById("d-notes").value;
    V.busy = true; render();
    const {data, error} = await sb.from("leads").update({status, notes}).eq("id", lead.id).select().single();
    V.busy = false;
    if (error){ toast("Gagal nyimpen: " + error.message); render(); return; }
    Object.assign(lead, data); V.draft = null; V.savedAt = Date.now(); render(); toast("Tersimpan");
  }
  async function remove(){
    const lead = V.leads.find(l => l.id === V.sel); if (!lead) return;
    V.busy = true; render();
    const {error} = await sb.from("leads").delete().eq("id", lead.id);
    V.busy = false; V.confirmDel = false;
    if (error){ toast("Gagal hapus: " + error.message); render(); return; }
    V.leads = V.leads.filter(l => l.id !== lead.id); V.sel = null; V.open = false; render(); toast("Lead " + lead.code + " dihapus");
  }

  /* ---------- ringkasan teks buat nyusun Report ---------- */
  function summary(lead){
    const ans = ansOf(lead), f = formOf(lead), d = FS.derive(f), sc = FS.score(ans), L = FS.layerVals(ans);
    const out = [];
    out.push("Failover Score " + lead.code);
    out.push("Nama: " + lead.name + (lead.age ? ", " + lead.age : ""));
    out.push("Masuk: " + when(lead.created_at) + (lead.source ? " (sumber: " + lead.source + ")" : ""));
    out.push("Score: " + sc + "/100 (" + FS.status(sc).label + ")");
    const pr = prioOf(lead);
    out.push("Prioritas: " + pr.label + (pr.why.length ? " (" + pr.why.join("; ") + ")" : ""));
    LAYERS.forEach(x => out.push("- " + x.name + ": " + Math.round(L[x.key] * 100) + "% (" + FS.layerStatus(L[x.key]).label + ")"));
    out.push("", "Jawaban kuis:");
    QUESTIONS.forEach((q, i) => out.push((i + 1) + ". " + q.short + ": " + (ans[i] == null ? "–" : q.opts[ans[i]][0])));
    out.push("", "Form Report:");
    out.push("Tanggungan: " + (d.hasDeps ? FS.joinID(d.deps) : "belum ada") + depAges(f));
    out.push("Pemasukan: " + label(INCOME, f.income));
    out.push("Pengeluaran rutin: " + FS.rp(d.expense) + " per bulan");
    out.push("Cicilan: " + (d.debts.length ? d.debts.map(x => x.label + " " + FS.rp(x.monthly) + "/bulan, sisa " + x.dur + " " + x.unit).join("; ") : "nggak ada"));
    out.push("Tabungan: " + FS.rp(d.savings));
    out.push("Perjalanan ke kantor: " + label(COMMUTE, f.commute));
    out.push("Preferensi: " + label(PREF, f.pref));
    out.push("", "Hitungan:");
    out.push("Emergency fund: " + (d.outflow ? FS.efText(d.ef) + " (" + FS.rp(d.savings) + " dibagi " + FS.rp(d.outflow) + " per bulan)" : "–"));
    if (d.hasDeps){
      out.push("Lama backup: " + d.years + " tahun, " + d.yearsWhy);
      out.push("Kebutuhan backup: " + FS.approx(d.need) + " = " + FS.rp(d.expense) + " x 12 x " + d.years + (d.remaining ? " + sisa cicilan " + FS.rp(d.remaining) : "") + " - tabungan " + FS.rp(d.savings));
      if (d.kpr) out.push("Catatan: cek apakah KPR udah ada asuransi jiwa kredit. Kalau iya, kebutuhannya jadi " + FS.approx(d.need - d.kpr.remaining));
    } else out.push("Asuransi jiwa belum prioritas: belum ada tanggungan" + (d.remaining ? ", sisa cicilan " + FS.rp(d.remaining) : ""));
    if (f.income) out.push("Budget asuransi (patokan 10%): " + BUDGET[f.income]);
    out.push("Langkah pertama: " + FS.firstStep(ans));
    return out.join("\n");
  }
  function depAges(f){
    const p = [];
    if (!f.deps.none && f.deps.anak) p.push((f.kids > 1 ? f.kids + " anak" : "anak") + ", paling kecil " + f.youngest + " th");
    if (!f.deps.none && f.deps.saudara) p.push((f.sibs > 1 ? f.sibs + " saudara" : "saudara") + ", paling kecil " + f.sibYoungest + " th");
    return p.length ? " (" + p.join("; ") + ")" : "";
  }
  async function copy(text, done){
    done = done || "Ringkasan disalin";
    try { await navigator.clipboard.writeText(text); toast(done); }
    catch (e) {
      const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); toast(done); } catch (e2) { toast("Nggak bisa nyalin otomatis. Blok teksnya, lalu salin manual."); }
      t.remove();
    }
  }

  /* ---------- draft Report buat dikirim lewat WhatsApp ----------
   * Isinya sama dengan Report di simulator: ringkasan, gambaran keluarga, coverage, action plan, catatan.
   * Format WhatsApp: *tebal* dan _miring_. Selalu dibaca dan diedit dulu sebelum dikirim.
   */
  function reportText(lead){
    const ans = ansOf(lead), f = formOf(lead), d = FS.derive(f);
    if (!FS.complete(ans)) return "Jawaban kuis lead ini nggak lengkap, jadi Report-nya nggak bisa disusun otomatis.";
    const name = (lead.name || "").trim() || "Kamu";
    const work = ["karyawan tetap", "karyawan kontrak", "freelance"][ans[7]];
    const syariah = f.pref === "syariah" ? " syariah" : "";
    const spouse = f.spouse || "pasangan";
    const incomeLabel = label(INCOME, f.income).replace(/^Di /, "di ");
    const L = [];

    const have = [];
    if (ans[3] === 0) have.push("BPJS aktif");
    if (ans[4] > 0) have.push("asuransi kesehatan " + (ans[4] === 1 ? "dari kantor" : "sendiri"));
    if (d.hasDeps && ans[5] > 0) have.push("asuransi jiwa " + (ans[5] === 1 ? "dari kantor" : "sendiri"));
    if (d.debts.length === 0) have.push("tanpa cicilan");
    const phrase = i => ({0:"pemasukan yang masih dari 1 sumber", 2:"emergency fund yang baru " + FS.efText(d.ef), 3:"status BPJS Kesehatan",
      4: ans[4] === 1 ? "asuransi kesehatan yang masih dari kantor" : "asuransi kesehatan di luar BPJS",
      5: ans[5] === 1 ? "proteksi pemasukan yang masih bergantung ke kantor" : "proteksi pemasukan buat keluarga",
      6:"porsi cicilan", 7: ans[7] === 1 ? "pemasukan yang bergantung ke kontrak" : "pemasukan yang naik-turun"})[i];
    const top = FS.weak(ans).filter(x => x.i !== 0).slice(0, 2).map(x => phrase(x.i));

    L.push("*Failover Report untuk " + name + "*");
    L.push(new Date().toLocaleDateString("id-ID", {day:"numeric", month:"long", year:"numeric"}));
    L.push("", "*Ringkasan*");
    L.push(name + ", " + (lead.age || "–") + ", " + work + ", " + (d.hasDeps ? "menanggung " + FS.joinID(d.deps) : "belum ada tanggungan") + ". " +
      (have.length ? "Fondasinya udah ada: " + FS.joinID(have) + ". " : "Fondasinya masih bisa banyak diperkuat, dan itu wajar. ") +
      (top.length ? (top.length > 1 ? "Dua hal yang paling perlu diperkuat: " : "Yang paling perlu diperkuat: ") + FS.joinID(top) + "." : "Backup-nya udah kuat, tinggal dijaga."));

    L.push("", "*Gambaran keluarga*");
    L.push("- " + name + ", pemasukan " + incomeLabel + " per bulan");
    if (d.hasDeps){
      if (f.deps.pasangan) L.push("- " + FS.cap(spouse));
      if (f.deps.anak) L.push("- " + (f.kids > 1 ? f.kids + " anak, paling kecil " + f.youngest + " tahun" : "Anak, " + f.youngest + " tahun"));
      if (f.deps.saudara) L.push("- " + (f.sibs > 1 ? f.sibs + " saudara, paling kecil " + f.sibYoungest + " tahun" : "Saudara, " + f.sibYoungest + " tahun"));
      if (f.deps.orangtua) L.push("- Orang tua");
    } else L.push("- Belum ada tanggungan");
    L.push("");
    L.push("- " + (ans[3] === 0 ? "BPJS Kesehatan aktif" : ans[3] === 1 ? "BPJS Kesehatan belum aktif" : "Status BPJS belum pasti"));
    L.push("- " + (ans[4] === 0 ? "Belum ada asuransi kesehatan selain BPJS" : "Asuransi kesehatan " + (ans[4] === 1 ? "dari kantor" : "sendiri")));
    L.push("- " + (d.hasDeps ? (ans[5] === 2 ? "Asuransi jiwa sendiri" : "Asuransi jiwa " + (ans[5] === 1 ? "dari kantor" : "belum ada")) : "Asuransi jiwa belum perlu"));
    L.push("- Emergency fund " + FS.efText(d.ef));
    d.debts.forEach(x => L.push("- " + (x.k === "kpr" ? "KPR" : x.label) + " " + FS.rp(x.monthly) + " per bulan, sisa " + x.dur + " " + x.unit));
    if (f.commute) L.push("- Perjalanan ke kantor " + label(COMMUTE, f.commute).toLowerCase());

    L.push("");
    if (d.hasDeps){
      L.push("*Coverage yang pas*");
      L.push("Kalau suatu saat kamu udah nggak ada, berapa yang dibutuhkan keluarga biar hidup tetap jalan" + (d.youngLabel ? " sampai " + d.youngLabel + " mandiri" : "") + "?");
      L.push("");
      L.push("Pengeluaran rutin " + FS.rp(d.expense) + " per bulan");
      L.push("x 12 bulan = " + FS.rp(d.expense * 12) + " setahun");
      L.push("x " + d.years + " tahun = " + FS.rp(d.base));
      L.push("_Kenapa " + d.years + " tahun: " + d.yearsWhy + "._");
      if (d.remaining > 0) L.push("Ditambah sisa cicilan " + FS.rp(d.remaining));
      L.push("Dikurangi tabungan yang udah ada " + FS.rp(d.savings));
      L.push("*Total kebutuhan: " + FS.approx(d.need) + "*");
      if (ans[5] === 1) L.push("", "Total itu masih perlu dikurangi asuransi jiwa dari kantor. Coba tanya HR berapa nilainya. Selisihnya itulah yang perlu kamu tutup sendiri.");
      else if (ans[5] === 2) L.push("", "Total itu masih perlu dikurangi asuransi jiwa yang udah kamu punya, lihat nilainya di polis. Selisihnya itulah yang perlu kamu tutup sendiri.");
      else L.push("", "Angka ini yang perlu ditutup dengan asuransi jiwa.");
      if (d.kpr) L.push("", "Catatan soal KPR: biasanya udah termasuk asuransi jiwa kredit yang melunasi sisa cicilannya. Cek di dokumen akad KPR. Kalau iya, cicilan KPR dicoret dan totalnya jadi " + FS.approx(d.need - d.kpr.remaining) + ".");
      L.push("", "_Hitungan sederhana, belum termasuk inflasi dan hasil investasi. Ilustrasi, bukan janji manfaat._");
    } else {
      L.push("*Asuransi jiwa belum prioritas*");
      L.push("Belum ada yang bergantung ke pemasukanmu, jadi asuransi jiwa belum mendesak." + (d.remaining > 0 ? " Kalau mau, yang kecil cukup buat nutup sisa cicilan " + FS.rp(d.remaining) + " biar nggak jadi beban keluarga." : "") + " Cek lagi kalau nanti menikah atau mulai bantu biaya orang tua.");
    }

    const plan = [];
    if (ans[3] !== 0) plan.push(["Aktifkan BPJS Kesehatan", "Fondasi paling murah buat biaya kesehatan. Cek status dan caranya di Mobile JKN."]);
    if (d.outflow > 0 && d.ef < 3){
      const t3 = 3 * d.outflow;
      plan.push(["Emergency fund ke 3 bulan dulu", "Target " + FS.rp(t3) + ", dari 3 x " + FS.rp(d.outflow) + " (pengeluaran" + (d.debtMonthly ? " + cicilan" : "") + "). Sekarang " + FS.rp(d.savings) + ", kurang " + FS.rp(t3 - d.savings) + ". Setelah itu lanjut pelan-pelan ke 6 bulan."]);
    } else if (d.outflow > 0 && d.ef < 6 && (ans[7] !== 0 || d.hasDeps)){
      const t6 = 6 * d.outflow;
      plan.push(["Emergency fund lanjut ke 6 bulan", "Target " + FS.rp(t6) + ". Sekarang " + FS.rp(d.savings) + ", kurang " + FS.rp(t6 - d.savings) + ". Nggak buru-buru, yang penting rutin."]);
    }
    if (f.commute === "1-2" || f.commute === "gt2"){
      const lbl = label(COMMUTE, f.commute).toLowerCase();
      plan.push(["Cek BPJS Ketenagakerjaan", ans[7] === 2
        ? "Perjalanan " + lbl + " tiap hari bikin waktu di jalan lebih panjang. Freelancer bisa daftar BPJS Ketenagakerjaan sendiri sebagai peserta mandiri, dan iurannya ringan."
        : "Perjalanan " + lbl + " tiap hari bikin waktu di jalan lebih panjang. BPJS Ketenagakerjaan dari kantor juga nanggung kecelakaan di perjalanan berangkat dan pulang kerja. Pastikan statusnya aktif."]);
    }
    if (ans[4] === 1 && ans[7] !== 1) plan.push(["Cek asuransi kesehatan kantor", d.careDeps.length ? "Udah aman buat sekarang. Cukup cek dua hal: limitnya per tahun, dan apakah " + FS.joinID(d.careDeps) + " ikut ditanggung." : "Udah aman buat sekarang. Cukup cek limitnya per tahun."]);
    if (d.hasDeps && ans[5] !== 2) plan.push(["Asuransi jiwa" + syariah + " punya sendiri", "Buat nutup kebutuhan di atas, pilih yang proteksi murni." + (ans[5] === 1 ? " Yang dari kantor tetap jalan, tapi ikut berhenti kalau kamu pindah kerja." : "") + (!f.deps.anak && f.deps.pasangan ? " Kalau nanti punya anak, hitungannya naik dan Report bisa dihitung ulang." : "")]);
    if (ans[4] === 0) plan.push(["Asuransi kesehatan" + syariah, "Biar biaya rumah sakit nggak ngambil dari emergency fund. Pilih yang biayanya muat di budget di bawah."]);
    if (ans[4] === 1 && ans[7] === 1) plan.push(["Siapin asuransi kesehatan" + syariah + " sendiri", "Yang dari kantor ikut berhenti kalau kontrak selesai. Nggak harus sekarang, tapi siapin sebelum kontrak habis."]);
    if (!plan.length) plan.push(["Review setahun sekali", "Backup-mu udah kuat. Cek lagi tiap ada perubahan besar: menikah, punya anak, pindah kerja, atau ambil cicilan."]);

    L.push("", "*Action plan*", "_Urutannya mulai dari yang paling murah._");
    plan.forEach((p, i) => L.push("", (i + 1) + ". *" + p[0] + "*", p[1]));

    if (ans[0] === 0) L.push("", "*Soal pemasukan dari 1 sumber*", "Nggak harus nambah kerjaan. Selama pemasukan masih dari 1 sumber, emergency fund dan proteksi di atas itulah backup-nya.");
    if (f.income) L.push("", "*Budget*", "Patokan umum: total biaya asuransi maksimal sekitar 10% pemasukan. Dengan pemasukan " + incomeLabel + ", budget-nya " + BUDGET[f.income] + ".");
    const notYet = d.ef < 3 ? "Produk yang ada unsur investasinya. Selama emergency fund belum 3 bulan, fokus ke proteksi murni dulu."
                 : (!d.hasDeps ? "Asuransi jiwa yang ada unsur investasinya. Belum ada kebutuhan yang mendesak." : "");
    if (notYet) L.push("", "*Belum perlu sekarang*", notYet);

    L.push("", "Semua angka di Report ini dari jawabanmu. Kalau ada yang kurang pas, bales aja di sini, nanti aku revisi.");
    L.push("Kalau mau ngobrol 20 menit buat bahas ini, bilang aja. Nggak ada kewajiban beli apa pun.");
    L.push("", CFG.OWNER_NAME + ", Failover Plan");
    L.push("_Report edukasi dari jawabanmu, disusun dengan bantuan AI dan dicek langsung sama aku. Produk dan biayanya mengikuti ilustrasi resmi dan polis._");
    return L.join("\n");
  }

  /* ---------- tampilan ---------- */
  function render(){
    if (V.view === "loading"){ $root.innerHTML = '<div class="card center"><p>Memuat...</p></div>'; return; }
    if (V.view === "noconfig"){
      $root.innerHTML = `<div class="card center"><h1>Supabase belum diisi</h1><p>Isi <code>SUPABASE_URL</code> dan <code>SUPABASE_KEY</code> di <code>config.js</code>, lalu buka halaman ini lagi.</p></div>`; return;
    }
    if (V.view === "login" || V.view === "signup"){
      const up = V.view === "signup";
      $root.innerHTML = `<form class="card center" id="${up ? "signup" : "login"}" novalidate>
        <h1>${up ? "Daftar akun Lead Desk" : "Masuk ke Lead Desk"}</h1>
        ${up ? "<p>Akun baru belum bisa lihat data apa pun sampai dijadiin admin.</p>" : ""}
        <div class="field"><label for="l-email">Email</label><input class="input" id="l-email" type="email" autocomplete="username" required value="${esc(V.email || "")}"></div>
        <div class="field"><label for="l-pass">Password${up ? " (minimal 8 karakter)" : ""}</label><input class="input" id="l-pass" type="password" autocomplete="${up ? "new-password" : "current-password"}" minlength="8" required></div>
        ${V.err ? `<p class="err" role="alert">${esc(V.err)}</p>` : ""}
        ${V.info ? `<p class="note" role="status" style="font-size:14px;color:var(--teal-deep);font-weight:600">${esc(V.info)}</p>` : ""}
        <button class="btn" type="submit" ${V.busy ? "disabled" : ""}>${V.busy ? "Tunggu..." : (up ? "Daftar" : "Masuk")}</button>
        <button class="btn alt" type="button" data-act="${up ? "to-login" : "to-signup"}">${up ? "Udah punya akun? Masuk" : "Belum punya akun? Daftar"}</button>
      </form>`;
      return;
    }
    if (V.view === "denied"){
      $root.innerHTML = `<div class="card center"><h1>Akun ini belum jadi admin</h1><p>Akunnya udah ada, tinggal dijadiin admin. Kirim email akun ini ke Claude, atau jalankan langkah 7 di <code>setup.sql</code>. Habis itu muat ulang halaman ini.</p><button class="btn alt" type="button" data-act="logout">Keluar</button></div>`;
      return;
    }
    const prio = new Map(V.leads.map(l => [l.id, prioOf(l)]));
    const counts = {all:V.leads.length, late:V.leads.filter(isLate).length, prio:V.leads.filter(l => prio.get(l.id).level === "high").length};
    STATUS.forEach(([k]) => { counts[k] = V.leads.filter(l => l.status === k).length; });
    const q = V.q.trim().toLowerCase();
    const inFilter = l => V.filter === "all" || (V.filter === "late" ? isLate(l) : V.filter === "prio" ? prio.get(l.id).level === "high" : l.status === V.filter);
    const shown = V.leads.filter(l => inFilter(l) &&
      (!q || l.code.toLowerCase().includes(q) || (l.name || "").toLowerCase().includes(q)));
    const fchip = (k, lbl) => `<button type="button" class="fchip" aria-pressed="${V.filter === k}" data-filter="${k}">${lbl}<span>${counts[k] || 0}</span></button>`;
    const items = shown.map(l => {
      const sc = l.score == null ? FS.score(ansOf(l)) : l.score;
      const pill = isLate(l) ? '<span class="pill late">Lewat janji</span>' : l.status === "baru" ? '<span class="pill new">Baru</span>' : l.status === "closing" ? '<span class="pill won">Closing</span>' : `<span class="pill">${esc(statusLabel(l.status))}</span>`;
      return `<button type="button" class="item" data-sel="${esc(l.id)}" aria-current="${V.sel === l.id}"><span class="nm">${esc(l.name)}${l.age ? ", " + esc(l.age) : ""}</span><span class="sc">${sc == null ? "–" : sc}</span>
        <span class="meta"><b>${esc(l.code)}</b><span>${rel(l.created_at)}</span>${l.source ? `<span>${esc(l.source)}</span>` : ""}${prioPill(prio.get(l.id))}${pill}</span></button>`;
    }).join("");
    const lead = V.leads.find(l => l.id === V.sel);
    $root.innerHTML = `
      <div class="bar">
        <input class="input search" id="q" type="search" placeholder="Cari kode atau nama" value="${esc(V.q)}" aria-label="Cari kode atau nama">
        <button type="button" class="btn alt" data-act="reload" ${V.busy ? "disabled" : ""}>${V.busy ? "Memuat..." : "Muat ulang"}</button>
      </div>
      ${recapHtml()}
      <div class="filters">${fchip("all", "Semua")}${fchip("prio", "Prioritas")}${counts.late ? fchip("late", "Lewat janji") : ""}${STATUS.map(([k, lbl]) => fchip(k, lbl)).join("")}</div>
      ${V.err ? `<p class="err" role="alert" style="margin-bottom:14px">${esc(V.err)}</p>` : ""}
      <div class="desk${V.open ? " open" : ""}">
        <div class="card list">${items || `<div class="empty">${V.leads.length ? "Nggak ada lead yang cocok sama filter ini." : "Belum ada lead yang masuk. Coba isi kuisnya sendiri dulu buat ngetes."}</div>`}</div>
        <div class="card detail">${lead ? detail(lead) : '<p class="placeholder">Pilih salah satu lead di kiri buat lihat detailnya.</p>'}</div>
      </div>`;
  }

  /* ---------- rekap per sumber ---------- */
  const RECAP_COLS = [["visits", "Pengunjung"], ["quiz_start", "Mulai kuis", "opt"], ["quiz_done", "Kuis selesai"], ["leads", "Minta Report"], ["wa_click", "Klik WA"]];
  function recapHtml(){
    const R = V.recap;
    const head = `<div class="recap-head"><h2>Rekap per sumber</h2><div class="grp">
        ${R.open ? [7, 30].map(n => `<button type="button" class="fchip" aria-pressed="${R.days === n}" data-recap-days="${n}">${n} hari</button>`).join("") : ""}
        <button type="button" class="lnk" data-act="recap-toggle" aria-expanded="${R.open}">${R.open ? "Sembunyikan" : "Lihat"}</button></div></div>`;
    if (!R.open) return `<section class="card recap">${head}</section>`;
    let body;
    if (R.err) body = `<p class="err" role="alert" style="margin-top:12px">${esc(R.err)}</p>`;
    else if (!R.rows) body = `<p class="note" style="margin-top:12px">Memuat rekap...</p>`;
    else if (!R.rows.length) body = `<p class="note" style="margin-top:12px">Belum ada pengunjung di ${R.days} hari terakhir.</p>`;
    else {
      const tot = {}; RECAP_COLS.forEach(([k]) => { tot[k] = R.rows.reduce((s, r) => s + (+r[k] || 0), 0); });
      const pct = (a, b) => b ? Math.round(a / b * 100) + "%" : "–";
      const row = (name, r, cls) => `<tr${cls ? ` class="${cls}"` : ""}><td>${name}</td>${RECAP_COLS.map(([k, , o]) => `<td class="r${o ? " " + o : ""}">${+r[k] || 0}</td>`).join("")}<td class="r opt">${pct(+r.wa_click || 0, +r.visits || 0)}</td></tr>`;
      body = `<div class="tablewrap"><table><thead><tr><th>Sumber</th>${RECAP_COLS.map(([, l, o]) => `<th class="r${o ? " " + o : ""}">${l}</th>`).join("")}<th class="r opt">Jadi chat</th></tr></thead>
        <tbody>${R.rows.map(r => row(r.source ? esc(r.source) : "Tanpa link sumber", r)).join("")}${R.rows.length > 1 ? row("Total", tot, "total") : ""}</tbody></table></div>
        <p class="note" style="margin-top:10px">Tiap langkah dihitung sekali per sesi browser, mulai 20 November 2026. Minta Report diambil dari lead yang masuk. Biaya per chat WA: total biaya iklan di Ads Manager dibagi Klik WA dari sumber <code>ads-</code>.</p>`;
    }
    return `<section class="card recap${R.busy ? " busy" : ""}">${head}${body}</section>`;
  }

  function detail(lead){
    const ans = ansOf(lead), f = formOf(lead), d = FS.derive(f), sc = FS.score(ans), L = FS.layerVals(ans), w = sc == null ? [] : FS.weak(ans);
    const layers = LAYERS.map(x => { const v = L[x.key], st = FS.layerStatus(v);
      return `<div class="ly"><b>${x.name}</b><span class="tr"><i style="width:${Math.round(v * 100)}%"></i></span><span class="st ${st.cls}">${Math.round(v * 100)}%</span></div>`; }).join("");
    const rows = QUESTIONS.map((q, i) => { const p = FS.pts(ans, i);
      return `<tr><td>${i + 1}. ${q.short}</td><td>${ans[i] == null ? "–" : q.opts[ans[i]][0]}${i === 5 && ans[1] === 0 ? " <span class=\"note\">(otomatis penuh, belum ada tanggungan)</span>" : ""}</td><td class="r ${p != null && p < q.max ? "miss" : ""}">${p == null ? "–" : p}/${q.max}</td></tr>`; }).join("");
    const debts = d.debts.length ? d.debts.map(x => `${esc(x.label)} ${FS.rp(x.monthly)}/bulan, sisa ${x.dur} ${x.unit}`).join("<br>") : "Nggak ada";
    let calc;
    if (d.hasDeps){
      calc = `<div class="calc">
        <div class="crow"><div>Pengeluaran rutin<span>dari form nomor 4</span></div><div class="v">${FS.rp(d.expense)}/bln</div></div>
        <div class="crow"><div>x 12 bulan</div><div class="v">${FS.rp(d.expense * 12)}</div></div>
        <div class="crow"><div>x ${d.years} tahun<span>${esc(d.yearsWhy)}</span></div><div class="v">${FS.rp(d.base)}</div></div>
        ${d.remaining ? `<div class="crow"><div>+ sisa cicilan<span>${d.debts.map(x => FS.rp(x.monthly) + " x " + x.months + " bulan").join(" + ")}</span></div><div class="v">${FS.rp(d.remaining)}</div></div>` : ""}
        <div class="crow"><div>- tabungan<span>dari form nomor 6</span></div><div class="v">${FS.rp(d.savings)}</div></div>
        <div class="crow sum"><div><b>Kebutuhan backup</b></div><div class="v">${FS.approx(d.need)}</div></div>
        ${ans[5] === 1 ? '<p class="note">Angka ini belum dikurangi asuransi jiwa dari kantor. Minta dia cek nilainya ke HR.</p>' : ans[5] === 2 ? '<p class="note">Angka ini belum dikurangi asuransi jiwa yang udah dia punya. Minta dia cek nilainya di polis.</p>' : ""}
        ${d.kpr ? `<p class="note">KPR biasanya udah ada asuransi jiwa kredit. Kalau iya, kebutuhannya jadi ${FS.approx(d.need - d.kpr.remaining)}.</p>` : ""}
      </div>`;
    } else {
      calc = `<div class="calc"><b>Asuransi jiwa belum prioritas</b><p class="note">Belum ada tanggungan.${d.remaining ? " Sisa cicilan " + FS.rp(d.remaining) + " bisa jadi patokan kalau dia tetap mau yang kecil." : ""}</p></div>`;
    }
    const dueDate = due(lead);
    const draft = V.draft && V.draft.id === lead.id ? V.draft : null;
    const curStatus = draft ? draft.status : lead.status, curNotes = draft ? draft.notes : (lead.notes || "");
    return `
      <button type="button" class="btn alt back" data-act="close">Kembali ke daftar</button>
      <div class="dhead">
        <div><h2>${esc(lead.name)}${lead.age ? ", " + esc(lead.age) : ""}</h2>
          <p class="sub"><b>${esc(lead.code)}</b>, masuk ${when(lead.created_at)}${lead.source ? ", dari " + esc(lead.source) : ""}</p>
          <p class="sub">Janji Report: ${dueDate.toLocaleDateString("id-ID", {weekday:"long", day:"numeric", month:"long"})}${isLate(lead) ? ' <span class="pill late">Lewat janji</span>' : ""}</p></div>
        <div><div class="bigscore">${sc == null ? "–" : sc}<small>/100</small></div><span>${sc == null ? "" : FS.status(sc).label}</span></div>
      </div>
      ${prioBox(prioOf(lead))}

      <section><h3>Status dan catatan</h3>
        <div class="manage">
          <div class="field"><label for="d-status">Status</label><select class="input" id="d-status">${STATUS.map(([k, lbl]) => `<option value="${k}" ${curStatus === k ? "selected" : ""}>${lbl}</option>`).join("")}</select></div>
          <div class="field"><label for="d-notes">Catatan</label><textarea class="input" id="d-notes" maxlength="5000" placeholder="Misalnya: udah chat 18 Nov, nunggu dia cek asuransi kantor.">${esc(curNotes)}</textarea></div>
          <div class="acts"><button type="button" class="btn" data-act="save" ${V.busy ? "disabled" : ""}>Simpan</button>
            <button type="button" class="btn alt" data-act="copy">Salin ringkasan buat Report</button>
            ${V.savedAt && Date.now() - V.savedAt < 4000 ? '<span class="saved">Tersimpan</span>' : ""}</div>
        </div>
      </section>

      <section><h3>Draft Report buat WhatsApp</h3>
        <p class="note" style="margin-bottom:10px">Udah disusun otomatis dari jawabannya. Baca dan edit dulu di kotak ini, lalu salin dan tempel di chat WhatsApp dia. Editan di kotak ini nggak disimpan.</p>
        <textarea class="input report" id="d-report" aria-label="Draft Report">${esc(V.report && V.report.id === lead.id ? V.report.text : reportText(lead))}</textarea>
        <div class="acts" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
          <button type="button" class="btn" data-act="copy-report">Salin Report</button>
          <button type="button" class="btn alt" data-act="reset-report">Susun ulang dari jawaban</button>
        </div>
      </section>

      <section><h3>Tiga lapis</h3><div class="layers">${layers}</div></section>

      <div class="two">
        <section><h3>Jawaban kuis</h3><table><thead><tr><th>Pertanyaan</th><th>Jawaban</th><th class="r">Poin</th></tr></thead><tbody>${rows}</tbody></table></section>
        <section><h3>Form Report</h3><dl class="kv">
          <dt>Tanggungan</dt><dd>${d.hasDeps ? esc(FS.joinID(d.deps)) + esc(depAges(f)) : "Belum ada"}</dd>
          <dt>Pemasukan</dt><dd>${esc(label(INCOME, f.income))}</dd>
          <dt>Pengeluaran</dt><dd>${FS.rp(d.expense)} per bulan</dd>
          <dt>Cicilan</dt><dd>${debts}</dd>
          <dt>Tabungan</dt><dd>${FS.rp(d.savings)}</dd>
          <dt>Ke kantor</dt><dd>${esc(label(COMMUTE, f.commute))}</dd>
          <dt>Preferensi</dt><dd>${esc(label(PREF, f.pref))}</dd>
        </dl></section>
      </div>

      <div class="two">
        <section><h3>Hitungan buat Report</h3>
          <dl class="kv" style="margin-bottom:12px">
            <dt>Emergency fund</dt><dd>${d.outflow ? FS.efText(d.ef) : "–"}</dd>
            <dt>Sisa cicilan total</dt><dd>${FS.rp(d.remaining)}</dd>
            <dt>Budget asuransi</dt><dd>${f.income ? esc(BUDGET[f.income]) : "–"}</dd>
          </dl>${calc}</section>
        <section><h3>Yang paling perlu diperkuat</h3>
          ${w.length ? `<ol class="weak">${w.map(x => `<li>${esc(FS.weakCopy(ans, x.i)[0])}</li>`).join("")}</ol>` : '<p class="note">Semua lapis udah kuat.</p>'}
          ${sc == null ? "" : `<div class="first" style="margin-top:12px"><b>Langkah pertama yang dia lihat</b><p>${esc(FS.firstStep(ans))}</p></div>`}
        </section>
      </div>

      <section><h3>Hapus data</h3>
        <p class="note" style="margin-bottom:10px">Pakai ini kalau dia minta datanya dihapus. Nggak bisa dibatalin.</p>
        ${V.confirmDel ? `<div class="acts" style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn danger" data-act="delete-yes" ${V.busy ? "disabled" : ""}>Ya, hapus ${esc(lead.code)}</button><button type="button" class="btn alt" data-act="delete-no">Batal</button></div>`
                       : `<button type="button" class="btn ghost-danger" data-act="delete">Hapus lead ini</button>`}
      </section>`;
  }

  function prioBox(p){
    return `<div class="prio ${p.level}"><b>${p.label}</b>${p.why.length ? `<ul>${p.why.map(w => `<li>${esc(FS.cap(w))}</li>`).join("")}</ul>` : '<p>Belum ada yang bikin dia jadi prioritas. Tetap kirim Report-nya sesuai janji.</p>'}
      <p>Patokan kasar buat urutan chat, dari pemasukan, tanggungan, proteksi yang belum ada, anak kecil, dan KPR.</p></div>`;
  }

  /* ---------- event ---------- */
  $root.addEventListener("submit", async e => {
    if (e.target.id !== "login" && e.target.id !== "signup") return;
    e.preventDefault();
    const up = e.target.id === "signup";
    const email = document.getElementById("l-email").value.trim(), password = document.getElementById("l-pass").value;
    V.email = email; V.info = null;
    if (!email || !password){ V.err = "Isi email dan password dulu."; render(); return; }
    if (up && password.length < 8){ V.err = "Password minimal 8 karakter."; render(); return; }
    V.busy = true; V.err = null; render();
    if (up){
      const {data, error} = await sb.auth.signUp({email, password});
      V.busy = false;
      if (error){ V.err = "Gagal daftar: " + error.message; render(); return; }
      if (data.session){ await afterLogin(data.user); return; }
      V.view = "login";
      V.info = "Akun dibuat. Kirim email ini ke Claude buat dikonfirmasi dan dijadiin admin, lalu masuk di sini.";
      render(); return;
    }
    const {data, error} = await sb.auth.signInWithPassword({email, password});
    V.busy = false;
    if (error){
      V.err = /confirm/i.test(error.message) ? "Email belum dikonfirmasi. Minta Claude konfirmasi akunmu, atau klik link di email dari Supabase." : "Email atau password salah.";
      render(); return;
    }
    await afterLogin(data.user);
  });
  $root.addEventListener("click", e => {
    const s = e.target.closest("[data-sel]");
    if (s){ V.sel = s.dataset.sel; V.open = true; V.confirmDel = false; V.savedAt = null; V.draft = null; V.report = null; render(); window.scrollTo(0, 0); return; }
    const fl = e.target.closest("[data-filter]");
    if (fl){ V.filter = fl.dataset.filter; render(); return; }
    const rd = e.target.closest("[data-recap-days]");
    if (rd){ if (+rd.dataset.recapDays !== V.recap.days){ V.recap.days = +rd.dataset.recapDays; loadRecap(); } return; }
    const a = e.target.closest("[data-act]"); if (!a || a.disabled) return;
    const lead = V.leads.find(l => l.id === V.sel);
    switch (a.dataset.act){
      case "reload": load(); if (V.recap.open) loadRecap(); break;
      case "recap-toggle":
        V.recap.open = !V.recap.open;
        try { localStorage.setItem("fs_recap_open", V.recap.open ? "1" : "0"); } catch (err) { /* nggak masalah */ }
        render(); if (V.recap.open && !V.recap.rows) loadRecap(); break;
      case "save": save(); break;
      case "copy": if (lead) copy(summary(lead)); break;
      case "copy-report": { const t = document.getElementById("d-report"); if (t) copy(t.value, "Report disalin. Tempel di chat WhatsApp-nya, lalu ganti status jadi Report dikirim."); break; }
      case "reset-report": V.report = null; render(); break;
      case "close": V.open = false; render(); break;
      case "delete": V.confirmDel = true; render(); break;
      case "delete-no": V.confirmDel = false; render(); break;
      case "delete-yes": remove(); break;
      case "logout": logout(); break;
      case "to-signup": V.view = "signup"; V.err = null; V.info = null; render(); break;
      case "to-login": V.view = "login"; V.err = null; V.info = null; render(); break;
    }
  });
  $root.addEventListener("input", e => {
    if (e.target.id === "d-report"){ V.report = {id:V.sel, text:e.target.value}; return; }
    if (e.target.id === "d-notes" || e.target.id === "d-status"){
      V.draft = {id:V.sel, status:document.getElementById("d-status").value, notes:document.getElementById("d-notes").value};
      return;
    }
    if (e.target.id !== "q") return;
    V.q = e.target.value; const pos = e.target.selectionStart; render();
    const el = document.getElementById("q"); el.focus(); el.setSelectionRange(pos, pos);
  });
  document.getElementById("logout").addEventListener("click", logout);
  async function logout(){ await sb.auth.signOut(); $who.hidden = true; V.leads = []; V.sel = null; V.view = "login"; render(); }

  render();
  start().catch(err => { console.error(err); V.view = "login"; V.err = "Gagal nyambung ke Supabase. Cek SUPABASE_URL dan SUPABASE_KEY di config.js."; render(); });
})();
