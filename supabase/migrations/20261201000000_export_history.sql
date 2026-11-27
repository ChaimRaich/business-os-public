-- Export history (SPEC 7, "ייצוא והיסטוריה"): a till file is waiting until the user
-- reports what happened to it. Besides "the till accepted it" (confirm_pos_export),
-- the user can now report that the till rejected it, with a note for follow-up.

alter table public.pos_exports
  add column problem_note text check (length(problem_note) between 1 and 500),
  add column problem_at timestamptz,
  add column problem_by uuid references auth.users (id) on delete set null;

-- The history screen lists every file of the business, newest first.
create index pos_exports_business_created_idx on public.pos_exports (business_id, created_at desc);

-- The user reports that the till did not accept the file. A later report replaces
-- the note. A file the till already accepted cannot be marked as failed.
create function public.report_pos_export_problem(p_export_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.pos_exports%rowtype;
  v_note text := left(btrim(coalesce(p_note, '')), 500);
begin
  select * into e from public.pos_exports where id = p_export_id for update;
  if not found or private.is_member(e.business_id) is not true then
    raise exception 'export_not_found' using errcode = 'P0002';
  end if;
  if e.confirmed_at is not null then
    raise exception 'already_confirmed' using errcode = 'P0001';
  end if;
  if v_note = '' then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  update public.pos_exports
  set problem_note = v_note, problem_at = now(), problem_by = auth.uid()
  where id = p_export_id;
end;
$$;

revoke all on function public.report_pos_export_problem(uuid, text) from public, anon;
grant execute on function public.report_pos_export_problem(uuid, text) to authenticated;
