-- Contact fields for the public "תולדות נסים" upload page: email, phone and
-- home address, collected on the form and carried onto the EZCount receipt.
alter table external_transfer_submissions add column if not exists email   text;
alter table external_transfer_submissions add column if not exists phone   text;
alter table external_transfer_submissions add column if not exists address text;
