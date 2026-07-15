-- Template-level file attachment for donor thank-you emails: each mosad's
-- template can carry one stored file (image/PDF/anything reasonable) that is
-- attached to every email sent from that template. Files live in the private
-- `email-attachments` Storage bucket; only server endpoints (service role)
-- touch it, so no storage RLS policies are needed for clients.

alter table email_templates add column if not exists attachment_path text;  -- path inside the email-attachments bucket
alter table email_templates add column if not exists attachment_name text;  -- original filename shown in the UI/email
alter table email_templates add column if not exists attachment_mime text;

insert into storage.buckets (id, name, public)
values ('email-attachments', 'email-attachments', false)
on conflict (id) do nothing;
