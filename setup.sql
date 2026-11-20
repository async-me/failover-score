-- =====================================================================
-- Failover Score: setup database di Supabase
--
-- Cara pakai: Supabase > SQL Editor > New query > paste SEMUA isi file ini > Run.
-- Aman dijalankan ulang kalau nanti ada perubahan.
--
-- Yang dibikin:
--   1. tabel leads        isi form yang masuk
--   2. tabel admins       siapa yang boleh buka Lead Desk
--   3. submit_lead()      satu-satunya pintu buat pengunjung ngirim data
--   4. aturan akses       pengunjung cuma bisa ngirim, nggak bisa baca apa pun
--   5. tabel events       penghitung pengunjung per sumber, tanpa data pribadi
--   6. purge_old_leads()  hapus data lebih dari 1 tahun (sesuai janji di form)
-- =====================================================================


-- 1. Tabel leads -------------------------------------------------------
create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  source      text,
  answers     smallint[] not null,
  score       smallint check (score between 0 and 100),
  name        text not null check (char_length(name) between 1 and 60),
  age         smallint check (age between 15 and 100),
  form        jsonb not null default '{}'::jsonb,
  consent     boolean not null default false,
  consent_at  timestamptz,
  status      text not null default 'baru'
              check (status in ('baru','dihubungi','report_dikirim','check_up','proposal','closing','belum_sekarang')),
  notes       text check (char_length(notes) <= 5000)
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists leads_touch_updated_at on public.leads;
create trigger leads_touch_updated_at
  before update on public.leads
  for each row execute function public.touch_updated_at();


-- 2. Admin ---------------------------------------------------------------
create table if not exists public.admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;


-- 3. Pintu masuk data dari halaman kuis ----------------------------------
-- Pengunjung nggak bisa nulis langsung ke tabel. Mereka cuma bisa manggil fungsi ini,
-- yang ngecek isinya dulu, lalu bikin kode unik kayak FP-7K2M.
create or replace function public.submit_lead(p jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name     text := btrim(coalesce(p->>'name', ''));
  v_age      smallint;
  v_score    smallint;
  v_source   text;
  v_answers  smallint[];
  v_max      smallint[] := array[2,3,3,2,2,2,2,2];   -- index pilihan terakhir tiap pertanyaan
  v_code     text;
  v_try      int := 0;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if coalesce(p->>'consent', '') <> 'true' then
    raise exception 'consent_required';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'invalid_name';
  end if;

  if jsonb_typeof(p->'answers') is distinct from 'array' or jsonb_array_length(p->'answers') <> 8 then
    raise exception 'invalid_answers';
  end if;
  if exists (select 1 from jsonb_array_elements_text(p->'answers') x where x !~ '^[0-9]$') then
    raise exception 'invalid_answers';
  end if;
  select array_agg(x::smallint order by i) into v_answers
    from jsonb_array_elements_text(p->'answers') with ordinality as t(x, i);
  for i in 1..8 loop
    if v_answers[i] > v_max[i] then
      raise exception 'invalid_answers';
    end if;
  end loop;

  if p->>'age' ~ '^[0-9]{1,3}$' and (p->>'age')::int between 15 and 100 then
    v_age := (p->>'age')::smallint;
  end if;
  if p->>'score' ~ '^[0-9]{1,3}$' and (p->>'score')::int between 0 and 100 then
    v_score := (p->>'score')::smallint;
  end if;
  if lower(p->>'source') ~ '^[a-z0-9_-]{1,40}$' then
    v_source := lower(p->>'source');
  end if;

  if p ? 'form' and jsonb_typeof(p->'form') is distinct from 'object' then
    raise exception 'invalid_form';
  end if;
  if octet_length(coalesce(p->'form', '{}'::jsonb)::text) > 4000 then
    raise exception 'form_too_large';
  end if;

  loop
    v_code := 'FP-' || (select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 4));
    begin
      insert into public.leads (code, source, answers, score, name, age, form, consent, consent_at)
      values (v_code, v_source, v_answers, v_score, v_name, v_age, coalesce(p->'form', '{}'::jsonb), true, now());
      return v_code;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try >= 5 then
        raise;
      end if;
    end;
  end loop;
end;
$$;


-- 4. Aturan akses ----------------------------------------------------------
alter table public.leads  enable row level security;
alter table public.admins enable row level security;

revoke all on public.leads  from anon, authenticated;
revoke all on public.admins from anon, authenticated;

-- Admin cuma boleh baca, ubah status dan catatan, dan hapus.
grant select, delete on public.leads to authenticated;
grant update (status, notes) on public.leads to authenticated;

drop policy if exists "admin baca leads"  on public.leads;
drop policy if exists "admin ubah leads"  on public.leads;
drop policy if exists "admin hapus leads" on public.leads;
create policy "admin baca leads"  on public.leads for select to authenticated using ((select public.is_admin()));
create policy "admin ubah leads"  on public.leads for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin hapus leads" on public.leads for delete to authenticated using ((select public.is_admin()));

revoke all on function public.submit_lead(jsonb)   from public, anon, authenticated;
revoke all on function public.is_admin()           from public, anon, authenticated;
revoke all on function public.touch_updated_at()   from public, anon, authenticated;
grant execute on function public.submit_lead(jsonb) to anon, authenticated;
grant execute on function public.is_admin()         to authenticated;


-- 5. Penghitung pengunjung -----------------------------------------------------
-- Cuma nyatet langkah apa dan dari link mana. Nggak ada nama, jawaban, score, IP, atau ID pengunjung.
-- Dedup sekali per sesi browser dilakukan di app.js.
create table if not exists public.events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('visit','quiz_start','quiz_done','wa_click')),
  source      text check (source ~ '^[a-z0-9_-]{1,40}$')
);
create index if not exists events_created_at_idx on public.events (created_at desc);

create or replace function public.track_event(p_kind text, p_src text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind is null or p_kind not in ('visit','quiz_start','quiz_done','wa_click') then
    return;
  end if;
  insert into public.events (kind, source)
  values (p_kind, case when lower(p_src) ~ '^[a-z0-9_-]{1,40}$' then lower(p_src) end);
end;
$$;

-- Rekap per sumber buat Lead Desk. "leads" diambil dari tabel leads, sisanya dari events.
create or replace function public.funnel_summary(p_days int default 7)
returns table (source text, visits bigint, quiz_start bigint, quiz_done bigint, leads bigint, wa_click bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 400)));
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  return query
    with e as (
      select coalesce(ev.source, '') as s, ev.kind from public.events ev where ev.created_at >= v_since
    ), l as (
      select coalesce(ld.source, '') as s from public.leads ld where ld.created_at >= v_since
    ), srcs as (
      select e.s from e union select l.s from l
    )
    select srcs.s,
      (select count(*) from e where e.s = srcs.s and e.kind = 'visit'),
      (select count(*) from e where e.s = srcs.s and e.kind = 'quiz_start'),
      (select count(*) from e where e.s = srcs.s and e.kind = 'quiz_done'),
      (select count(*) from l where l.s = srcs.s),
      (select count(*) from e where e.s = srcs.s and e.kind = 'wa_click')
    from srcs
    order by 2 desc, 5 desc, 1;
end;
$$;

alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
revoke all on function public.track_event(text, text) from public, anon, authenticated;
revoke all on function public.funnel_summary(int)     from public, anon, authenticated;
grant execute on function public.track_event(text, text) to anon, authenticated;
grant execute on function public.funnel_summary(int)     to authenticated;


-- 6. Hapus data lebih dari 1 tahun -------------------------------------------
create or replace function public.purge_old_leads()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.leads where created_at < now() - interval '1 year' returning 1
  ), old_events as (
    delete from public.events where created_at < now() - interval '1 year' returning 1
  )
  select count(*)::int from gone;
$$;
revoke all on function public.purge_old_leads() from public, anon, authenticated;

-- Jalankan manual sebulan sekali di SQL Editor:
--   select public.purge_old_leads();
-- Atau jadwalkan otomatis: Database > Extensions > aktifkan pg_cron, lalu jalankan:
--   select cron.schedule('hapus-leads-lama', '0 3 1 * *', 'select public.purge_old_leads()');


-- 7. Jadikan akunmu admin ------------------------------------------------
-- Jalankan SETELAH bikin akun di Authentication > Users. Ganti emailnya, lalu Run baris ini aja:
--   insert into public.admins (user_id) select id from auth.users where email = 'email-kamu@gmail.com' on conflict do nothing;
