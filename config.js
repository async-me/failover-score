/*
 * Satu-satunya file yang perlu kamu isi.
 * Selama SUPABASE_URL atau SUPABASE_KEY masih kosong, web jalan di mode demo:
 * semua layar bisa dicoba, tapi data form nggak dikirim ke mana-mana.
 */
window.FS_CONFIG = {
  // Supabase > Project Settings > API (atau Data API). Contoh: "https://abcdefgh.supabase.co"
  SUPABASE_URL: "https://dvdwygekvxvdyhlykagp.supabase.co",

  // Supabase > Project Settings > API Keys. Pakai "publishable key" (diawali sb_publishable_)
  // atau "anon public key". JANGAN pakai secret key atau service_role key di sini.
  SUPABASE_KEY: "sb_publishable_ShF_s-NdAlS1dumPHb9zZA_xpTn3VJP",

  // Nomor WhatsApp Business kamu, diawali 62, tanpa +, spasi, atau tanda hubung. Contoh: "6281234567890"
  WHATSAPP_NUMBER: "",

  OWNER_NAME: "Bayu",
  HANDLE: "@failover.plan",

  // Janji waktu kirim Report, dalam hari kerja.
  REPORT_WORKDAYS: 2,

  // Opsional: link template Family Runbook (Notion atau Google Docs). Kosongin kalau belum ada.
  RUNBOOK_URL: ""
};
