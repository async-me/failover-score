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
  const V = {view:"loading", leads:[], sel:null, filter:"all", q:"", open:false, confirmDel:false, busy:false, err:null, savedAt:null, draft:null};

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
    V.view = "desk"; await load();
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
  async function copy(text){
    try { await navigator.clipboard.writeText(text); toast("Ringkasan disalin"); }
    catch (e) {
      const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); toast("Ringkasan disalin"); } catch (e2) { toast("Nggak bisa nyalin otomatis"); }
      t.remove();
    }
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
      $root.innerHTML = `<div class="card center"><h1>Akun ini belum jadi admin</h1><p>Akunnya udah ada, tinggal dijadiin admin. Kirim email akun ini ke Claude, atau jalankan langkah 6 di <code>setup.sql</code>. Habis itu muat ulang halaman ini.</p><button class="btn alt" type="button" data-act="logout">Keluar</button></div>`;
      return;
    }
    const counts = {all:V.leads.length, late:V.leads.filter(isLate).length};
    STATUS.forEach(([k]) => { counts[k] = V.leads.filter(l => l.status === k).length; });
    const q = V.q.trim().toLowerCase();
    const shown = V.leads.filter(l => (V.filter === "all" || (V.filter === "late" ? isLate(l) : l.status === V.filter)) &&
      (!q || l.code.toLowerCase().includes(q) || (l.name || "").toLowerCase().includes(q)));
    const fchip = (k, lbl) => `<button type="button" class="fchip" aria-pressed="${V.filter === k}" data-filter="${k}">${lbl}<span>${counts[k] || 0}</span></button>`;
    const items = shown.map(l => {
      const sc = l.score == null ? FS.score(ansOf(l)) : l.score;
      const pill = isLate(l) ? '<span class="pill late">Lewat janji</span>' : l.status === "baru" ? '<span class="pill new">Baru</span>' : l.status === "closing" ? '<span class="pill won">Closing</span>' : `<span class="pill">${esc(statusLabel(l.status))}</span>`;
      return `<button type="button" class="item" data-sel="${esc(l.id)}" aria-current="${V.sel === l.id}"><span class="nm">${esc(l.name)}${l.age ? ", " + esc(l.age) : ""}</span><span class="sc">${sc == null ? "–" : sc}</span>
        <span class="meta"><b>${esc(l.code)}</b><span>${rel(l.created_at)}</span>${l.source ? `<span>${esc(l.source)}</span>` : ""}${pill}</span></button>`;
    }).join("");
    const lead = V.leads.find(l => l.id === V.sel);
    $root.innerHTML = `
      <div class="bar">
        <input class="input search" id="q" type="search" placeholder="Cari kode atau nama" value="${esc(V.q)}" aria-label="Cari kode atau nama">
        <button type="button" class="btn alt" data-act="reload" ${V.busy ? "disabled" : ""}>${V.busy ? "Memuat..." : "Muat ulang"}</button>
      </div>
      <div class="filters">${fchip("all", "Semua")}${counts.late ? fchip("late", "Lewat janji") : ""}${STATUS.map(([k, lbl]) => fchip(k, lbl)).join("")}</div>
      ${V.err ? `<p class="err" role="alert" style="margin-bottom:14px">${esc(V.err)}</p>` : ""}
      <div class="desk${V.open ? " open" : ""}">
        <div class="card list">${items || `<div class="empty">${V.leads.length ? "Nggak ada lead yang cocok sama filter ini." : "Belum ada lead yang masuk. Coba isi kuisnya sendiri dulu buat ngetes."}</div>`}</div>
        <div class="card detail">${lead ? detail(lead) : '<p class="placeholder">Pilih salah satu lead di kiri buat lihat detailnya.</p>'}</div>
      </div>`;
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

      <section><h3>Status dan catatan</h3>
        <div class="manage">
          <div class="field"><label for="d-status">Status</label><select class="input" id="d-status">${STATUS.map(([k, lbl]) => `<option value="${k}" ${curStatus === k ? "selected" : ""}>${lbl}</option>`).join("")}</select></div>
          <div class="field"><label for="d-notes">Catatan</label><textarea class="input" id="d-notes" maxlength="5000" placeholder="Misalnya: udah chat 18 Nov, nunggu dia cek asuransi kantor.">${esc(curNotes)}</textarea></div>
          <div class="acts"><button type="button" class="btn" data-act="save" ${V.busy ? "disabled" : ""}>Simpan</button>
            <button type="button" class="btn alt" data-act="copy">Salin ringkasan buat Report</button>
            ${V.savedAt && Date.now() - V.savedAt < 4000 ? '<span class="saved">Tersimpan</span>' : ""}</div>
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
    if (s){ V.sel = s.dataset.sel; V.open = true; V.confirmDel = false; V.savedAt = null; V.draft = null; render(); window.scrollTo(0, 0); return; }
    const fl = e.target.closest("[data-filter]");
    if (fl){ V.filter = fl.dataset.filter; render(); return; }
    const a = e.target.closest("[data-act]"); if (!a || a.disabled) return;
    const lead = V.leads.find(l => l.id === V.sel);
    switch (a.dataset.act){
      case "reload": load(); break;
      case "save": save(); break;
      case "copy": if (lead) copy(summary(lead)); break;
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
