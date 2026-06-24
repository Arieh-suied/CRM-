-- Persistent notes the AI assistant remembers across all future conversations.
-- Only admins can add notes (enforced in frontend/api/ai-assistant.js, not by RLS,
-- since the backend uses the service role key).
create table if not exists ai_assistant_notes (
  id         uuid default gen_random_uuid() primary key,
  content    text not null,
  created_by text,
  created_at timestamptz default now()
);

alter table ai_assistant_notes enable row level security;

drop policy if exists "auth_read_ai_assistant_notes" on ai_assistant_notes;
create policy "auth_read_ai_assistant_notes" on ai_assistant_notes for select to authenticated using (true);
