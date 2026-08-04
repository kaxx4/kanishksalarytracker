-- The salary tracker runs without a login, so the anon role needs access.
--
-- Trade-off, recorded deliberately: RLS stays enabled but the policy is open to
-- anon. The publishable key is embedded in the client bundle, so anyone holding
-- that key can read and write pay figures and bank account numbers through the
-- Supabase API. Acceptable while the app runs only on the operator's machine;
-- re-introduce auth before hosting it anywhere public.

do $$
declare t text;
begin
  foreach t in array array[
    'salary_companies','salary_employees','salary_holidays',
    'salary_attendance','salary_runs','salary_run_lines','salary_neft_rows'
  ] loop
    execute format('drop policy if exists %I on %I', t || '_authenticated', t);
    execute format('drop policy if exists %I on %I', t || '_open', t);
    execute format(
      'create policy %I on %I for all to anon, authenticated using (true) with check (true)',
      t || '_open', t
    );
  end loop;
end $$;
