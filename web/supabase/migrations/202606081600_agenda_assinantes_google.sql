-- Quem assinou notificacao de agenda Google e para quais tipos de reuniao.
-- Uma linha por (usuario, tipo). O fluxo:
--   - usuario abre Modal "Sincronizar com Agenda Google"
--   - informa o email Google dele
--   - marca os tipos de reuniao que quer receber
--   - a Edge Function google-calendar adiciona esse email como attendee
--     toda vez que uma reuniao desse tipo for criada/editada/cancelada

create table if not exists public.agenda_assinantes_google (
  id              bigserial primary key,
  usuario_id      bigint       not null,
  google_email    text         not null,
  tipo_reuniao_id uuid         not null references public.tipos_reuniao(id) on delete cascade,
  criado_em       timestamptz  not null default now(),
  atualizado_em   timestamptz  not null default now(),
  unique (usuario_id, tipo_reuniao_id)
);

create index if not exists idx_agenda_assinantes_tipo
  on public.agenda_assinantes_google (tipo_reuniao_id);

create index if not exists idx_agenda_assinantes_usuario
  on public.agenda_assinantes_google (usuario_id);

comment on table public.agenda_assinantes_google is
  'Inscricoes por usuario para receber convite Google em reunioes de certos tipos.';

-- Farol nao usa Supabase Auth (login via usuarios_aprovadores), entao a
-- RLS padrao bloquearia inserts do anon. Desliga aqui pra alinhar com
-- as outras tabelas da app.
alter table public.agenda_assinantes_google disable row level security;
