# google-calendar (Farol)

Edge Function que sincroniza reuniões da Agenda Tática com o Google Agenda
do admin (1 conta), enviando convite por email para cada participante.
Cada participante recebe o invite no Gmail e o evento aparece na agenda
dele automaticamente — sem precisar conectar a conta Google.

## Setup

### 1. Migration

Roda `supabase/migrations/202606081500_reunioes_google_event_id.sql` no
banco do Farol (SQL Editor → New query → cola → RUN). Adiciona a coluna
`google_event_id` em `reunioes`.

### 2. Google Cloud Console

Mesma OAuth Client usada pelo Especial do Inove serve, **desde que** o
Google account dono do refresh token tenha o Google Calendar habilitado.
Se for criar novo:

1. https://console.cloud.google.com/apis/credentials
2. "Criar credenciais" → OAuth client ID → Tipo "Web application"
3. Adicionar redirect URI: `https://developers.google.com/oauthplayground`
4. Anotar Client ID e Client Secret

### 3. Gerar refresh token (1 vez)

1. https://developers.google.com/oauthplayground/
2. Engrenagem (⚙️) → marca "Use your own OAuth credentials" → cola Client
   ID/Secret
3. No campo de scope, cola: `https://www.googleapis.com/auth/calendar`
4. "Authorize APIs" → login com a conta que será dona da agenda
5. "Exchange authorization code for tokens" → copia o `refresh_token`

### 4. Secrets no Supabase (Farol)

Project Settings → Edge Functions → Secrets:

| Secret | Valor |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth Client Secret |
| `GOOGLE_REFRESH_TOKEN` | refresh_token do passo 3 |
| `GOOGLE_CALENDAR_ID` | `primary` ou ID de outra agenda |

### 5. Deploy

```bash
cd C:\Users\Guilh\Repositorios\FAROL\web
supabase functions deploy google-calendar
```

## Como funciona

- Toda criação/edição/movimentação de reunião → chama `sincronizarReuniaoGoogle(id)`
- A função monta o evento com título, horário, sala, responsável e os
  emails de `participantes_reuniao` como `attendees`
- Se a reunião muda pra status "Cancelada" → o evento é apagado do Google
- Adicionar/remover participante em `DetalhesReuniao` também re-sincroniza
- ID do evento Google fica em `reunioes.google_event_id` (evita duplicar)

## Endpoints

`POST /google-calendar`
```json
{ "action": "upsert", "reuniao": {...}, "emails": ["a@b.com"] }
{ "action": "delete", "reuniaoId": 123 }
```
