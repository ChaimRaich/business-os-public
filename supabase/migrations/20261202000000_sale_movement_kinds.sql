-- Separate file: a new enum value cannot be used in the transaction that adds it.
alter type public.movement_kind add value 'sale';
alter type public.movement_kind add value 'return';
