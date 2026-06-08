-- Coluna pra guardar o id do evento no Google Calendar, evitando duplicar
-- quando a reuniao for editada e re-sincronizada.

alter table public.reunioes
  add column if not exists google_event_id text;

comment on column public.reunioes.google_event_id is
  'ID do evento no Google Calendar (preenchido pela Edge Function google-calendar).';
