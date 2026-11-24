/*
 * Failover Score: halaman kuis.
 * Alur: intro (3 layar), 8 pertanyaan, ngitung, hasil, kartu story (opsional), form Report, terkirim.
 * Jawaban cuma ada di layar pengunjung. Data baru dikirim ke Supabase waktu mereka submit form Report.
 */
(function () {
  "use strict";

  const CFG = Object.assign({OWNER_NAME:"Bayu", HANDLE:"@failover.plan", REPORT_WORKDAYS:2, RUNBOOK_URL:"", WHATSAPP_NUMBER:"", META_PIXEL_ID:""}, window.FS_CONFIG || {});
  const DEMO = !CFG.SUPABASE_URL || !CFG.SUPABASE_KEY;
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js";
  const {QUESTIONS, LAYERS, INCOME, COMMUTE, DEBT_TYPES, PREF} = window.FS;

  /* ?src=ig / ?src=tiktok / ?src=threads di link, buat tahu leads datang dari mana */
  const params = new URLSearchParams(location.search);
  const SOURCE = ((params.get("src") || params.get("utm_source") || "").toLowerCase().match(/^[a-z0-9_-]{1,40}$/) || [""])[0];

  /* ---------- ngukur iklan ----------
   * Penghitung pengunjung sendiri (tabel events di Supabase), plus Meta Pixel kalau META_PIXEL_ID diisi.
   * Yang dikirim cuma nama langkahnya dan sumber link. Nama, jawaban, score, dan isi form nggak pernah ikut.
   * Tiap langkah dihitung sekali per sesi browser.
   */
  const PIXEL_ID = /^\d{6,20}$/.test(String(CFG.META_PIXEL_ID || "").trim()) ? String(CFG.META_PIXEL_ID).trim() : "";
  const PIXEL_EVENT = {quiz_done:["trackCustom", "QuizComplete"], lead:["track", "Lead"], wa_click:["track", "Contact"]};
  function once(key){ try { if (sessionStorage.getItem("fs_" + key)) return false; sessionStorage.setItem("fs_" + key, "1"); } catch (e) { /* storage diblok: tetap kirim */ } return true; }
  function track(kind){
    if (!once(kind)) return;
    const px = PIXEL_EVENT[kind];
    if (px && PIXEL_ID && window.fbq) window.fbq(px[0], px[1]);
    if (DEMO || kind === "lead") return;                     // lead udah kecatat di tabel leads
    try {
      fetch(CFG.SUPABASE_URL + "/rest/v1/rpc/track_event", {method:"POST",
        headers:{"apikey":CFG.SUPABASE_KEY, "Content-Type":"application/json"},
        body:JSON.stringify({p_kind:kind, p_src:SOURCE || null})}).catch(() => {});
    } catch (e) { /* ngukur gagal nggak boleh ganggu kuis */ }
  }
  function loadPixel(){
    if (!PIXEL_ID || window.fbq) return;
    const n = window.fbq = function(){ n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!window._fbq) window._fbq = n;
    n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    n.disablePushState = true;                               // pindah layar di dalam kuis bukan kunjungan baru
    const s = document.createElement("script"); s.async = true; s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
    n("set", "autoConfig", false, PIXEL_ID);                 // jangan baca tombol dan isi halaman otomatis
    n("init", PIXEL_ID);
    n("track", "PageView");
  }

  const S = {screen:"intro1", ans:[null,null,null,null,null,null,null,null], form:FS.blankForm(), code:null, sending:false, error:null, hp:""};
  const NEEDS_SCORE = {calc:1, result:1, share:1, form:1, sent:1};
  let calcTimer = null;
  const $app = document.getElementById("app");

  /* ---------- helpers ---------- */
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function addWorkdays(d, n){ const x = new Date(d); while (n > 0){ x.setDate(x.getDate() + 1); const w = x.getDay(); if (w !== 0 && w !== 6) n--; } return x; }
  function fmt(d, o){ return d.toLocaleDateString("id-ID", o); }
  const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Sheet "Report lengkap" yang nempel di bawah layar hasil.
   * Layar pertama: kebuka penuh (judul, isi Report, tombol). Begitu di-scroll: mengecil jadi judul + tombol.
   * Di HP pendek yang bakal nutupin tiga lapis, langsung mulai dari versi kecil. */
  function reportSheet(){
    const deps = S.ans[1] !== 0;
    return `<section class="sheet open" id="report-sheet" aria-labelledby="rs-title">
      <span class="grab" aria-hidden="true"></span>
      <h2 id="rs-title">Report lengkap kamu, gratis</h2>
      <div class="more"><p>${deps ? "Angka coverage asuransi jiwa, urutan langkah, dan budget" : "Asuransi mana yang perlu duluan, urutan langkah, dan budget"} yang pas buat kamu.</p></div>
      <button type="button" class="btn" id="to-form" data-act="go:form">Minta Report gratis</button>
      <div class="more"><p class="note">Tinggal 8 pertanyaan lagi, jawabanmu tadi udah kebawa. Dikirim lewat WhatsApp maksimal ${+CFG.REPORT_WORKDAYS || 2} hari kerja, tanpa telepon.</p></div>
    </section>`;
  }
  let sheetOff = null;
  function setupSheet(){
    if (sheetOff){ sheetOff(); sheetOff = null; }
    const sh = document.getElementById("report-sheet"); if (!sh) return;
    const layers = $app.querySelector(".layers");
    const canOpen = window.scrollY < 24 && (!layers || layers.getBoundingClientRect().bottom + 16 <= window.innerHeight - sh.offsetHeight);
    const set = () => { const open = canOpen && window.scrollY < 24; sh.classList.toggle("open", open); sh.classList.toggle("mini", !open); };
    set();
    window.addEventListener("scroll", set, {passive:true});
    sheetOff = () => window.removeEventListener("scroll", set);
  }

  const CHECK = (c, s) => `<svg width="${s || 14}" height="${s || 14}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>`;
  const CHEV = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  const WM = '<span class="wm">Failover <span>Plan</span></span>';
  function back(id, to, label){ return `<button type="button" class="tbtn muted" id="${id}" data-act="go:${to}">${CHEV}${label || "Back"}</button>`; }
  function layersHtml(vals, opt){
    opt = opt || {};
    const label = LAYERS.map(L => L.name + " " + Math.round(vals[L.key] * 100) + " persen").join(", ");
    return `<div class="layers${opt.navy ? " on-navy" : ""}" role="img" aria-label="${label}">${LAYERS.map(L => {
      const v = vals[L.key], st = FS.layerStatus(v);
      return `<div class="ly"><div class="ly-name"><b>${L.name}</b>${opt.status ? `<span class="ly-st ${st.cls}">${st.label}</span>` : ""}</div><div class="ly-bar"><i data-w="${Math.round(v * 100)}" style="width:${opt.animate ? 0 : Math.round(v * 100)}%"></i></div></div>`;
    }).join("")}</div>`;
  }
  function glyph(key){ return `<svg width="18" height="16" viewBox="0 0 18 16" aria-hidden="true">${LAYERS.map((L, i) => `<rect x="0" y="${i * 6}" width="18" height="4" rx="1.5" fill="${L.key === key ? "#14a397" : "#cfd9df"}"/>`).join("")}</svg>`; }
  const demoBanner = () => DEMO ? '<div class="demo">Mode demo: Supabase belum diisi di config.js, jadi data form nggak dikirim.</div>' : "";

  /* ---------- layar ---------- */
  const SCREENS = {
    intro1(){
      return `<div class="scr">
        <div class="navyband">
          <div class="bar">${WM}<span class="small" style="color:var(--on-navy-2)">${esc(CFG.HANDLE)}</span></div>
          ${layersHtml({income:.55, health:.85, ef:.7}, {navy:true, animate:true})}
          </div>
        <div class="pad intro">
          <div class="stack" style="gap:10px">
            <h1 class="h1 xl" tabindex="-1">Failover Score</h1>
            <p class="lead">Seberapa kuat backup keuangan keluargamu? Cek dalam 2 menit.</p>
            <p class="quick">8 pertanyaan, tinggal tap. Gratis, tanpa daftar.</p>
          </div>
          <div class="foot">
            <button type="button" class="btn go" id="start" data-act="go:q0">Mulai cek</button>
            <p class="tiny fine" id="measure-note">Jawaban nggak disimpan, cuma kunjungan yang dihitung${PIXEL_ID ? " (termasuk Meta Pixel)" : ""}.<br>Dibuat oleh ${esc(CFG.OWNER_NAME)}, konsultan asuransi berlisensi.</p>
          </div>
        </div>
      </div>`;
    },
    question(i){
      const q = QUESTIONS[i], a = S.ans[i], last = i === 7, L = LAYERS.find(x => x.key === q.layer);
      const ticks = QUESTIONS.map((_, j) => `<i class="${j < i ? "done" : j === i ? "now" : ""}"></i>`).join("");
      const opts = q.opts.map((o, j) => `<button type="button" class="opt" role="radio" id="opt-${i}-${j}" aria-checked="${a === j}" data-act="ans:${i}:${j}"><span>${o[0]}</span><span class="ck">${a === j ? CHECK("#06231f") : ""}</span></button>`).join("");
      return `<div class="scr"><div class="pad">
        <div class="stack" style="gap:10px">
          <div class="bar">${back("q-back", i === 0 ? "intro1" : "q" + (i - 1))}<span class="small" style="font-weight:600">${i + 1} dari 8</span></div>
          <div class="ticks" aria-hidden="true">${ticks}</div>
        </div>
        <div class="stack" style="gap:10px">
          <span class="layer-tag">${glyph(q.layer)}Lapis ${L.name.toLowerCase()}</span>
          <h1 class="h1" tabindex="-1">${q.title}</h1>
          <p class="p" style="font-size:15px">${q.help}</p>
        </div>
        <div class="opts" role="radiogroup" aria-label="Pilihan jawaban">${opts}</div>
        <p class="why"><b>Kenapa ditanya?</b> ${q.why}</p>
        <div class="foot"><button type="button" class="btn" id="q-next" data-act="${a == null ? "noop" : (last ? "go:calc" : "go:q" + (i + 1))}" aria-disabled="${a == null}">${last ? "See my score" : "Next"}</button></div>
      </div></div>`;
    },
    calc(){
      return `<div class="scr"><div class="pad">
        <div class="bar">${WM}</div>
        <div class="stack" style="margin:auto 0;gap:28px">
          <div class="stack"><h1 class="h1 lg" tabindex="-1">Lagi ngitung score kamu</h1><p class="p">Ngecek lapis demi lapis.</p></div>
          ${layersHtml(FS.layerVals(S.ans), {animate:true})}
        </div>
        <button type="button" class="tbtn muted" id="calc-skip" style="align-self:center" data-act="go:result">Lewati</button>
      </div></div>`;
    },
    result(){
      const sc = FS.score(S.ans), st = FS.status(sc), w = FS.weak(S.ans), sf = FS.safeList(S.ans);
      const lead = sc >= 70 ? (w.length ? "Backup-mu udah kuat. Masih ada yang bisa dirapikan." : "Backup-mu udah kuat. Tinggal dijaga, dan cek lagi setahun sekali.")
                 : sc >= 40 ? "Fondasimu udah ada. Tinggal perkuat " + w.length + " hal ini biar makin tenang."
                 : "Masih banyak ruang buat diperkuat, dan itu wajar. Mulai dari 1 langkah paling gampang di bawah.";
      const fixes = w.map((x, r) => { const c = FS.weakCopy(S.ans, x.i), pr = r < 2 && x.m > 4;
        return `<li><span class="d${pr ? " p" : ""}"></span><div><b>${c[0]}</b><p>${c[1]}</p></div><span class="when${pr ? " p" : ""}">${pr ? "Prioritas" : "Nanti"}</span></li>`; }).join("");
      return `<div class="scr"><div class="pad has-sheet">
        <div class="bar">${WM}<span class="small">Score kamu</span></div>
        <div class="stack" style="gap:12px">
          <div class="score-head"><h1 class="score-num" tabindex="-1" style="margin:0">${sc}<small>/100</small></h1><span class="status${st.low ? " low" : ""}" style="margin-bottom:6px">${st.label}</span></div>
          <p class="lead" style="font-size:17px">${lead}</p>
        </div>
        ${layersHtml(FS.layerVals(S.ans), {status:true, animate:true})}
        ${w.length ? `<div class="stack" style="gap:4px"><h2 class="h2">Yang bisa diperkuat</h2><ul class="fixes">${fixes}</ul></div>` : ""}
        ${sf.length ? `<div class="stack" style="gap:10px"><h2 class="h2">Udah aman</h2><ul class="safe">${sf.map(s => `<li>${CHECK("#0b7a72")}${s}</li>`).join("")}</ul></div>` : ""}
        <div class="firststep"><b>Langkah pertama yang paling gampang</b><p>${FS.firstStep(S.ans)}</p></div>
        <p class="tiny" style="margin:0">Score ini alat edukasi dari jawabanmu sendiri, bukan penilaian risiko resmi atau rekomendasi produk.</p>
        <button type="button" class="tbtn share-link" id="to-share" data-act="go:share">Share score kamu ke Story</button>
      </div></div>
      ${reportSheet()}`;
    },
    share(){
      const sc = FS.score(S.ans), st = FS.status(sc);
      return `<div class="scr"><div class="pad" style="gap:16px">
        <div class="bar">${back("share-back", "result")}<span class="small">Kartu story</span></div>
        <div class="story">
          <span class="wm" style="color:var(--on-navy)">Failover <span>Plan</span></span>
          <div class="stack" style="gap:6px"><span style="font-size:15px;font-weight:600;color:var(--on-navy-2)">Failover Score keluargaku</span><span class="big">${sc}<small>/100</small></span><span class="status${st.low ? " low" : ""}" style="color:var(--on-navy)">${st.label}</span></div>
          ${layersHtml(FS.layerVals(S.ans), {navy:true})}
          <p class="line">${st.share}</p>
          <div class="ft"><div class="stack" style="gap:0"><span style="font-size:13px;color:var(--on-navy-2)">Cek punyamu lewat link di bio</span><b style="font-size:16px">${esc(CFG.HANDLE)}</b></div><span style="font-size:13px;font-weight:700;color:var(--mint)">2 menit</span></div>
        </div>
        <h1 class="h2" tabindex="-1">Screenshot kartu ini, terus upload ke Story kamu.</h1>
        <p class="small" style="margin:0">Nggak ada data pribadi di kartunya, cuma score dan tiga lapis.</p>
        <button type="button" class="btn alt" id="share-done" data-act="go:result">Balik ke hasil</button>
      </div></div>`;
    },
    form(){
      const f = S.form;
      const kvs = QUESTIONS.map((q, i) => `<div><span>${q.short}</span><b>${S.ans[i] == null ? "–" : q.opts[S.ans[i]][0]}</b></div>`).join("");
      const chip = (id, act, on, label, role) => `<button type="button" class="chip" id="${id}" ${role ? `role="radio" aria-checked="${on}"` : `aria-pressed="${on}"`} data-act="${act}">${label}</button>`;
      const stepper = (id, label, val, act) => `<div class="stepper"><button type="button" id="${id}-minus" aria-label="Kurangi ${label}" data-act="${act}:-1">−</button><span aria-live="polite">${val}</span><button type="button" id="${id}-plus" aria-label="Tambah ${label}" data-act="${act}:1">+</button></div>`;
      const money = (id, field, val, per) => `<div class="money"><span>Rp</span><input id="${id}" inputmode="numeric" autocomplete="off" data-money="${field}" value="${val ? FS.num(val, 0) : ""}" placeholder="0">${per ? "<span>/bulan</span>" : ""}</div>`;
      const q = (n, title, body, forId) => `<section class="fsec">${forId ? `<label class="fq" for="${forId}"><span class="n">${n}</span>${title}</label>` : `<h2 class="fq"><span class="n">${n}</span>${title}</h2>`}${body}</section>`;
      const anyDebt = DEBT_TYPES.some(([k]) => f.debts[k].on);
      const debtDetail = f.noDebt ? "" : DEBT_TYPES.filter(([k]) => f.debts[k].on).map(([k, label]) => { const d = f.debts[k]; return `
        <div class="sub"><span class="t">${label}</span>
          <div class="field"><label for="debt-${k}">Cicilan per bulan</label>${money("debt-" + k, "debt:" + k, d.monthly, false)}</div>
          <div class="field"><span style="font-size:13px;font-weight:600;color:var(--ink-2)">Sisa berapa lama?</span>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${stepper("dur-" + k, "sisa", d.dur, "dur:" + k)}
              <div class="unit" role="radiogroup" aria-label="Satuan"><button type="button" role="radio" id="unit-${k}-bulan" aria-checked="${d.unit === "bulan"}" data-act="unit:${k}:bulan">Bulan</button><button type="button" role="radio" id="unit-${k}-tahun" aria-checked="${d.unit === "tahun"}" data-act="unit:${k}:tahun">Tahun</button></div></div>
            <span class="tiny">Kurang dari 1 tahun? Ganti ke Bulan.</span></div>
        </div>`; }).join("");
      const ok = canSubmit();
      return `<div class="scr"><div class="pad" style="gap:18px">
        <div class="bar">${back("form-back", "result")}<span class="small">Failover Report</span></div>
        <div class="stack"><h1 class="h1" tabindex="-1">Tinggal sedikit lagi</h1><p class="p" style="font-size:15px">Tambah 8 pertanyaan ini, sekitar 2 menit. Kira-kira aja, nggak perlu angka persis.</p></div>
        <details class="carried"><summary><span>8 jawaban score kamu udah kebawa</span><span class="tbtn teal">Lihat</span></summary><div class="kvs">${kvs}<button type="button" class="tbtn teal" id="form-edit" data-act="go:q0" style="align-self:flex-start">Edit jawaban</button></div></details>

        ${q(1, "Nama panggilan dan umur", `<div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:8px">
            <div class="field"><label for="f-name">Nama panggilan</label><input class="input" id="f-name" data-text="name" maxlength="60" value="${esc(f.name)}" autocomplete="given-name"></div>
            <div class="field"><label for="f-age">Umur</label><input class="input" id="f-age" data-text="age" inputmode="numeric" maxlength="3" value="${esc(f.age)}" autocomplete="off"></div></div>`)}

        ${q(2, "Siapa aja yang kamu tanggung?", `<div class="chips">${chip("dep-pasangan", "dep:pasangan", !!f.deps.pasangan, "Pasangan")}${chip("dep-anak", "dep:anak", !!f.deps.anak, "Anak")}${chip("dep-orangtua", "dep:orangtua", !!f.deps.orangtua, "Orang tua")}${chip("dep-saudara", "dep:saudara", !!f.deps.saudara, "Saudara / keponakan")}${chip("dep-none", "dep:none", !!f.deps.none, "Belum ada")}</div>
          ${f.deps.anak ? `<div class="sub"><span class="t">Anak</span><div class="row"><span style="font-size:14.5px;font-weight:600">Jumlah anak</span>${stepper("kids", "jumlah anak", f.kids, "kids")}</div><div class="row"><span style="font-size:14.5px;font-weight:600">Umur anak paling kecil</span>${stepper("young", "umur anak", f.youngest, "young")}</div></div>` : ""}
          ${f.deps.saudara ? `<div class="sub"><span class="t">Saudara / keponakan</span><div class="row"><span style="font-size:14.5px;font-weight:600">Jumlah</span>${stepper("sibs", "jumlah saudara", f.sibs, "sibs")}</div><div class="row"><span style="font-size:14.5px;font-weight:600">Umur yang paling kecil</span>${stepper("sibyoung", "umur saudara", f.sibYoungest, "sibyoung")}</div><span class="tiny">Misalnya adik atau keponakan yang biaya hidup atau sekolahnya kamu bantu.</span></div>` : ""}
          <span class="tiny">Umur yang paling kecil dipakai buat ngitung berapa lama keluarga perlu backup. Belum ada tanggungan? Pilih Belum ada, nggak apa-apa.</span>`)}

        ${q(3, "Pemasukan kamu per bulan", `<div class="grid2" role="radiogroup">${INCOME.map(([k, l]) => chip("income-" + k, "income:" + k, f.income === k, l, true)).join("")}</div><span class="tiny">Cukup range-nya. Dipakai buat ngira budget yang masuk akal.</span>`)}

        ${q(4, "Pengeluaran rutin per bulan", `${money("f-expense", "expense", f.expense, true)}<span class="tiny">Makan, listrik, kos atau kontrakan, sekolah, transport. Cicilan nggak usah dimasukin, ditanya di nomor 5.</span>`, "f-expense")}

        ${q(5, "Cicilan yang masih jalan", `<div class="chips">${DEBT_TYPES.map(([k, l]) => chip("debt-chip-" + k, "debt:" + k, !f.noDebt && f.debts[k].on, l)).join("")}${chip("debt-chip-none", "nodebt", f.noDebt, "Nggak ada")}</div>${debtDetail}${!f.noDebt && anyDebt ? '<span class="tiny">Nggak perlu tahu sisa utangnya. Cukup cicilan per bulan dan sisa lamanya, nanti dihitung otomatis.</span>' : ""}`)}

        ${q(6, "Tabungan yang bisa dipakai kapan aja", `${money("f-savings", "savings", f.savings, false)}<span class="tiny">Tabungan atau deposito yang bisa cepat dicairkan. Rumah dan kendaraan nggak dihitung.</span>`, "f-savings")}

        ${q(7, "Perjalanan ke tempat kerja, sekali jalan", `<div class="chips" role="radiogroup">${COMMUTE.map(([k, l]) => chip("commute-" + k, "commute:" + k, f.commute === k, l, true)).join("")}</div><span class="tiny">Makin lama di jalan, makin penting proteksi kecelakaan.</span>`)}

        ${q(8, "Kamu lebih nyaman dengan yang mana?", `<div class="grid3" role="radiogroup">${PREF.map(([k, l]) => chip("pref-" + k, "pref:" + k, f.pref === k, l, true)).join("")}</div>`)}

        <section class="fsec"><p class="small" style="margin:0">Form ini sengaja nggak nanya riwayat kesehatan. Jadi nggak perlu tulis data kesehatan di sini.</p>
          <label class="consent" for="f-consent"><input type="checkbox" id="f-consent" ${f.consent ? "checked" : ""}>Aku setuju jawaban ini dipakai ${esc(CFG.OWNER_NAME)} buat nyusun Report-ku, dan disimpan paling lama 1 tahun.</label>
          <div class="hp" aria-hidden="true"><label for="f-website">Website</label><input id="f-website" data-text="__hp" tabindex="-1" autocomplete="off" value="${esc(S.hp)}"></div>
        </section>
        ${S.error ? `<p class="err" role="alert">${esc(S.error)}</p>` : ""}
        <div class="foot"><button type="button" class="btn" id="f-submit" data-act="submit" aria-disabled="${!ok || S.sending}">${S.sending ? "Ngirim..." : "Submit"}</button><span class="tiny" style="text-align:center" id="f-submit-hint">${submitHint()}</span></div>
      </div></div>`;
    },
    sent(){
      const deadline = addWorkdays(new Date(), +CFG.REPORT_WORKDAYS || 2);
      const msg = "Halo " + CFG.OWNER_NAME + ", aku mau Report Failover Score. Kode: " + S.code;
      const num = String(CFG.WHATSAPP_NUMBER || "").replace(/\D/g, "");
      const wa = num ? `<a class="btn wa" id="to-wa" href="https://wa.me/${num}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Kirim kode lewat WhatsApp</a><span class="tiny" style="text-align:center">Pesannya udah keisi otomatis. Kamu tinggal tekan kirim.</span>`
                     : `<p class="err" style="margin:0">Nomor WhatsApp belum diisi di config.js.</p>`;
      return `<div class="scr"><div class="pad">
        <div class="bar">${WM}</div>
        <div class="stack" style="gap:14px;padding-top:8px"><div class="okmark">${CHECK("#0b7a72", 26)}</div>
          <h1 class="h1" tabindex="-1">Form masuk! Satu langkah lagi.</h1><p class="p">Kirim kode ini ke WhatsApp aku. Report-nya nanti aku kirim di chat yang sama.</p></div>
        <div class="codebox"><span class="small">Kode kamu</span><b>${esc(S.code)}</b></div>
        <div class="stack">${wa}</div>
        <div class="facts"><div><span>Dikirim lewat</span><b>WhatsApp Business ${esc(CFG.OWNER_NAME)}</b></div><div><span>Paling lambat</span><b>${fmt(deadline, {weekday:"long", day:"numeric", month:"long"})}</b></div><div><span>Isinya</span><b>Report tertulis, sekitar 5 menit baca</b></div></div>
        ${CFG.RUNBOOK_URL ? `<div class="note foot"><b>Sambil nunggu: Family Runbook</b><p>Template gratis buat nyatet semua info penting keluarga di satu tempat. Enak diisi bareng pasangan.</p><a class="tbtn teal" id="runbook" href="${esc(CFG.RUNBOOK_URL)}" target="_blank" rel="noopener" style="align-self:flex-start">Get the template</a></div>` : ""}
      </div></div>`;
    }
  };

  /* ---------- form ---------- */
  function canSubmit(){ return !!((S.form.name || "").trim() && S.form.consent); }
  function submitHint(){ return canSubmit() ? `Report dikirim lewat WhatsApp, maksimal ${+CFG.REPORT_WORKDAYS || 2} hari kerja.` : "Isi nama panggilan dan centang persetujuan dulu."; }
  function updateSubmit(){
    const b = document.getElementById("f-submit"), h = document.getElementById("f-submit-hint"); if (!b) return;
    b.setAttribute("aria-disabled", canSubmit() && !S.sending ? "false" : "true");
    h.textContent = submitHint();
  }
  /* yang dikirim di kolom form: cuma data yang dipakai buat hitungan Report */
  function formPayload(f){
    const debts = {};
    if (!f.noDebt) DEBT_TYPES.forEach(([k]) => { const d = f.debts[k]; if (d.on) debts[k] = {on:true, monthly:+d.monthly || 0, dur:d.dur, unit:d.unit}; });
    return {deps:f.deps, kids:f.kids, youngest:f.youngest, sibs:f.sibs, sibYoungest:f.sibYoungest, income:f.income,
      expense:+f.expense || 0, debts, noDebt:!!f.noDebt, savings:+f.savings || 0, commute:f.commute, pref:f.pref};
  }
  let clientPromise = null;
  function getClient(){
    if (!clientPromise) clientPromise = new Promise((resolve, reject) => {
      const make = () => resolve(window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {auth:{persistSession:false, autoRefreshToken:false}}));
      if (window.supabase && window.supabase.createClient) return make();
      const s = document.createElement("script"); s.src = SUPABASE_JS; s.async = true;
      s.onload = make; s.onerror = () => { clientPromise = null; reject(new Error("supabase-js gagal dimuat")); };
      document.head.appendChild(s);
    });
    return clientPromise;
  }
  async function submit(){
    if (S.sending || !canSubmit()) return;
    S.sending = true; S.error = null; renderScreen(true);
    const f = S.form;
    const payload = {name:f.name.trim(), age:String(f.age || "").trim(), answers:S.ans, score:FS.score(S.ans), source:SOURCE, consent:true, form:formPayload(f)};
    try {
      let code;
      if (S.hp){ code = "FP-0000"; }                        // isian jebakan bot terisi: pura-pura sukses, nggak dikirim
      else if (DEMO){ await new Promise(r => setTimeout(r, 500)); code = "FP-DEMO"; }
      else {
        const sb = await getClient();
        const {data, error} = await sb.rpc("submit_lead", {p:payload});
        if (error) throw error;
        code = data;
      }
      S.code = code; S.sending = false;
      if (!S.hp) track("lead");
      go("sent", {replace:true});
    } catch (e) {
      console.error(e);
      S.sending = false;
      S.error = "Form-nya gagal kekirim. Cek koneksi internet, lalu tekan Submit lagi.";
      renderScreen(true);
    }
  }

  /* ---------- render dan navigasi ---------- */
  function screenHtml(id){ return /^q\d$/.test(id) ? SCREENS.question(+id.charAt(1)) : SCREENS[id](); }
  function renderScreen(keepScroll){
    const y = window.scrollY;
    const focusId = document.activeElement && $app.contains(document.activeElement) ? document.activeElement.id : null;
    const openDetails = !!$app.querySelector("details.carried[open]");
    $app.innerHTML = demoBanner() + screenHtml(S.screen);
    if (openDetails && keepScroll){ const d = $app.querySelector("details.carried"); if (d) d.open = true; }
    if (keepScroll){
      window.scrollTo(0, y);
      if (focusId){ const el = document.getElementById(focusId); if (el) el.focus({preventScroll:true}); }
    } else {
      window.scrollTo(0, 0);
      const h = $app.querySelector("h1[tabindex]"); if (h) h.focus({preventScroll:true});
    }
    setupSheet();
    const bars = $app.querySelectorAll(".ly-bar i[data-w]");
    if (bars.length && bars[0].style.width === "0%"){
      bars.forEach((b, i) => setTimeout(() => { b.style.width = b.dataset.w + "%"; }, reduceMotion() ? 0 : 120 + i * (S.screen === "calc" ? 450 : 160)));
    }
  }
  function firstUnanswered(){ const i = S.ans.findIndex(a => a == null); return i < 0 ? null : "q" + i; }
  function go(screen, opt){
    opt = opt || {};
    clearTimeout(calcTimer);
    if (NEEDS_SCORE[screen] && !FS.complete(S.ans)) screen = firstUnanswered() || "q0";
    if (screen === "sent" && !S.code) screen = "form";
    if (screen === "form" && S.code) screen = "sent";        // form udah terkirim, jangan dobel
    if (screen === "form") FS.syncForm(S.ans, S.form);
    if (screen === "intro2" || screen === "intro3") screen = "intro1";   // dulu pembukanya 3 layar
    S.screen = screen;
    if (screen === "q0") track("quiz_start");
    if (screen === "result") track("quiz_done");
    if (!opt.fromHistory){
      const state = {screen};
      if (opt.replace || screen === "result" && history.state && history.state.screen === "calc") history.replaceState(state, "");
      else history.pushState(state, "");
    }
    renderScreen(false);
    if (screen === "calc") calcTimer = setTimeout(() => { if (S.screen === "calc") go("result"); }, reduceMotion() ? 600 : 2300);
  }
  window.addEventListener("popstate", e => { go((e.state && e.state.screen) || "intro1", {fromHistory:true}); });

  /* ---------- event ---------- */
  $app.addEventListener("click", e => {
    if (e.target.closest("#to-wa")){ track("wa_click"); return; }
    const el = e.target.closest("[data-act]"); if (!el) return;
    if (el.getAttribute("aria-disabled") === "true") return;
    const parts = el.dataset.act.split(":"), act = parts[0], a1 = parts[1], a2 = parts[2], f = S.form;
    switch (act){
      case "noop": return;
      case "go": go(a1); return;
      case "submit": submit(); return;
      case "ans": S.ans[+a1] = +a2; break;
      case "dep": if (a1 === "none") f.deps = FS.noDeps(!f.deps.none); else { f.deps[a1] = !f.deps[a1]; f.deps.none = false; } break;
      case "kids": f.kids = Math.min(8, Math.max(1, f.kids + +a1)); break;
      case "young": f.youngest = Math.min(40, Math.max(0, f.youngest + +a1)); break;
      case "sibs": f.sibs = Math.min(8, Math.max(1, f.sibs + +a1)); break;
      case "sibyoung": f.sibYoungest = Math.min(40, Math.max(0, f.sibYoungest + +a1)); break;
      case "income": f.income = a1; break;
      case "debt": f.noDebt = false; f.debts[a1].on = !f.debts[a1].on; break;
      case "nodebt": f.noDebt = !f.noDebt; if (f.noDebt) Object.keys(f.debts).forEach(k => { f.debts[k].on = false; }); break;
      case "dur": { const d = f.debts[a1]; d.dur = Math.min(d.unit === "bulan" ? 11 : 30, Math.max(1, d.dur + +a2)); break; }
      case "unit": { const d = f.debts[a1]; d.unit = a2; if (a2 === "bulan" && d.dur > 11) d.dur = 11; break; }
      case "commute": f.commute = a1; break;
      case "pref": f.pref = a1; break;
      default: return;
    }
    renderScreen(true);
  });
  $app.addEventListener("input", e => {
    const t = e.target, f = S.form;
    if (t.dataset.text === "__hp"){ S.hp = t.value; return; }
    if (t.dataset.text){
      if (t.dataset.text === "age") t.value = t.value.replace(/\D/g, "").slice(0, 3);
      f[t.dataset.text] = t.value;
      if (t.dataset.text === "name") updateSubmit();
      return;
    }
    if (t.dataset.money){
      const digits = t.value.replace(/\D/g, "").slice(0, 13), v = digits ? parseInt(digits, 10) : 0;
      t.value = digits ? FS.num(v, 0) : "";
      const key = t.dataset.money;
      if (key.indexOf("debt:") === 0) f.debts[key.slice(5)].monthly = v; else f[key] = v;
    }
  });
  $app.addEventListener("change", e => { if (e.target.id === "f-consent"){ S.form.consent = e.target.checked; updateSubmit(); } });

  history.replaceState({screen:"intro1"}, "");
  renderScreen(false);
  loadPixel();
  track("visit");
})();
