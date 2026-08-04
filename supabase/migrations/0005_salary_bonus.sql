-- Bonus feature: mirrors the salary_runs family, one bonus run per
-- (company, financial year). The formula (reverse-engineered against
-- BONUS CALCULATION.xls, see HANDOFF.md) is:
--   monthly bonus wage = payable + ptax - tiffin, for each FY month with a saved run
--   annual bonus wage   = sum of that figure, April -> March
--   bonus                = annual bonus wage * rate, rounded per company/FY setting
--
-- fy_start_year is the calendar year the financial year begins in, e.g. 2024
-- for FY2024-25 (April 2024 - March 2025).

create table if not exists salary_bonus_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references salary_companies(id) on delete cascade,
  fy_start_year int not null,
  rate numeric(6,4) not null default 0.165,
  round_rule text not null default 'nearest' check (round_rule in ('up', 'nearest', 'down')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, fy_start_year)
);

create table if not exists salary_bonus_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references salary_companies(id) on delete cascade,
  fy_start_year int not null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  rate numeric(6,4) not null default 0.165,
  round_rule text not null default 'nearest' check (round_rule in ('up', 'nearest', 'down')),
  cheque_no text,
  letter_date date,
  value_date date,
  neft_total numeric(14,2) not null default 0,
  cash_total numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  is_historical boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (company_id, fy_start_year)
);

create table if not exists salary_bonus_lines (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references salary_bonus_runs(id) on delete cascade,
  employee_id uuid references salary_employees(id) on delete set null,
  employee_name text not null,
  beneficiary_name text not null,
  bank_ifsc text,
  bank_account_no text,
  bank_account_type text not null default 'SB',
  annual_wage numeric(14,2) not null default 0,
  months_counted smallint not null default 0,
  bonus_amount numeric(14,2) not null default 0,
  rounded numeric(14,2) not null default 0,
  pay_mode text not null default 'neft' check (pay_mode in ('neft', 'cash', 'excluded')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists salary_bonus_lines_run_idx on salary_bonus_lines (run_id, sort_order);

create table if not exists salary_bonus_neft_rows (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references salary_bonus_runs(id) on delete cascade,
  run_line_id uuid not null references salary_bonus_lines(id) on delete cascade,
  seq int not null,
  amount numeric(14,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists salary_bonus_neft_rows_run_idx on salary_bonus_neft_rows (run_id, seq);

-- Same open-access policy as every other salary_* table (see 0002_no_auth.sql):
-- this app runs without login, anon role does everything.
do $$
declare
  t text;
begin
  foreach t in array array[
    'salary_bonus_settings', 'salary_bonus_runs', 'salary_bonus_lines', 'salary_bonus_neft_rows'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_open', t);
    execute format(
      'create policy %I on %I for all to anon, authenticated using (true) with check (true)',
      t || '_open', t
    );
  end loop;
end $$;

alter publication supabase_realtime add table salary_bonus_settings;
alter publication supabase_realtime add table salary_bonus_runs;
alter publication supabase_realtime add table salary_bonus_lines;
alter publication supabase_realtime add table salary_bonus_neft_rows;
