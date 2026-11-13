-- Ejecutar en Supabase > SQL Editor > New query > Run.
-- Crear usuarios autorizados en Authentication > Users > Add user.
create table if not exists public.registros_cuartel (
 categoria text not null check (categoria in ('aplicaciones','riegos','labores')),
 cuartel text not null check (cuartel ~ '^[0-9]{1,2}$' and cuartel::integer between 1 and 78),
 datos jsonb not null default '{}'::jsonb,
 actualizado_en timestamptz not null default now(),
 actualizado_por uuid default auth.uid(),
 primary key (categoria, cuartel)
);
alter table public.registros_cuartel enable row level security;
revoke all on public.registros_cuartel from anon;
grant select, insert, update, delete on public.registros_cuartel to authenticated;
drop policy if exists "usuarios_autenticados_lectura" on public.registros_cuartel;
drop policy if exists "usuarios_autenticados_insertan" on public.registros_cuartel;
drop policy if exists "usuarios_autenticados_actualizan" on public.registros_cuartel;
drop policy if exists "usuarios_autenticados_eliminan" on public.registros_cuartel;
create policy "usuarios_autenticados_lectura" on public.registros_cuartel for select to authenticated using (true);
create policy "usuarios_autenticados_insertan" on public.registros_cuartel for insert to authenticated with check (true);
create policy "usuarios_autenticados_actualizan" on public.registros_cuartel for update to authenticated using (true) with check (true);
create policy "usuarios_autenticados_eliminan" on public.registros_cuartel for delete to authenticated using (true);
-- Activar actualizaciones en tiempo real (si ya existe, no duplicar).
do $$ begin
 alter publication supabase_realtime add table public.registros_cuartel;
exception when duplicate_object then null; end $$;
