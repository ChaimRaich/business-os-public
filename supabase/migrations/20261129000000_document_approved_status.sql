-- Separate file: a new enum value cannot be used in the transaction that adds it.
alter type public.document_status add value 'approved';
