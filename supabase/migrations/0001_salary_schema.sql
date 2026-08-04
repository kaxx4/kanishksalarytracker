-- Salary tracker schema for Calcutta Traders and M.K. Cycles (P) Ltd.
-- Additive only: every object is prefixed salary_ and nothing existing is touched.
-- RLS is on for all tables -- these hold pay figures and bank account numbers.

create extension if not exists pgcrypto;

-- search_path is pinned so the trigger cannot be hijacked via a role-local
-- search_path (Supabase linter 0011).
create or replace function salary_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- companies

create table if not exists salary_companies (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  name                text not null,
  address_line        text,
  gst_no              text,
  cin_no              text,

  -- Remitter details as they must appear in the HDFC bulk NEFT file.
  remitter_name       text not null,
  account_no          text not null,
  branch_code         text not null default '1242',
  sender_account_type text not null default 'CA',

  -- Letter addressee.
  bank_name           text not null default 'HDFC BANK',
  bank_branch         text not null default 'India Exchange Place Branch',
  bank_city           text not null default 'Kolkata',

  -- Calculation settings.
  tiffin_rate         numeric(10,2) not null default 10,
  pay_divisor_basis   text not null default 'calendar'
                        check (pay_divisor_basis in ('calendar','working')),
  weekly_off_days     smallint[] not null default '{0}',   -- 0 = Sunday
  ptax_slabs          jsonb not null default
                        '[{"upto":10000,"amount":0},
                          {"upto":15000,"amount":110},
                          {"upto":25000,"amount":130},
                          {"upto":40000,"amount":150},
                          {"upto":null,"amount":200}]'::jsonb,
  min_neft_rows       smallint not null default 10,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists salary_companies_updated_at on salary_companies;
create trigger salary_companies_updated_at before update on salary_companies
  for each row execute function salary_set_updated_at();

-- ---------------------------------------------------------------- employees

create table if not exists salary_employees (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references salary_companies(id) on delete cascade,

  -- Two names on purpose: the salary sheet and the bank records disagree
  -- (e.g. "BIRENDER KR SHAW" vs "BIRENDER KUMAR SHAW"). The bank file must
  -- carry beneficiary_name exactly.
  name              text not null,
  beneficiary_name  text not null,

  monthly_pay       numeric(12,2) not null default 0,
  tiffin_eligible   boolean not null default false,

  bank_ifsc         text,
  bank_account_no   text,
  bank_account_type text not null default 'SB',

  is_director       boolean not null default false,
  default_pay_mode  text not null default 'neft'
                      check (default_pay_mode in ('neft','cash','excluded')),

  join_date         date,
  phone             text,
  notes             text,
  sort_order        integer not null default 0,
  active            boolean not null default true,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists salary_employees_company_idx
  on salary_employees (company_id, sort_order);

drop trigger if exists salary_employees_updated_at on salary_employees;
create trigger salary_employees_updated_at before update on salary_employees
  for each row execute function salary_set_updated_at();

-- ----------------------------------------------------------------- holidays

create table if not exists salary_holidays (
  id          uuid primary key default gen_random_uuid(),
  -- null means the holiday applies to every company.
  company_id  uuid references salary_companies(id) on delete cascade,
  holiday_on  date not null,
  name        text,
  created_at  timestamptz not null default now()
);

create unique index if not exists salary_holidays_unique_idx
  on salary_holidays (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), holiday_on);

-- --------------------------------------------------------------- attendance

create table if not exists salary_attendance (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references salary_employees(id) on delete cascade,
  marked_on    date not null,
  status       text not null default 'present'
                 check (status in ('present','absent','half_day','paid_leave','holiday')),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (employee_id, marked_on)
);

create index if not exists salary_attendance_month_idx
  on salary_attendance (marked_on, employee_id);

drop trigger if exists salary_attendance_updated_at on salary_attendance;
create trigger salary_attendance_updated_at before update on salary_attendance
  for each row execute function salary_set_updated_at();

-- --------------------------------------------------------------- month runs

create table if not exists salary_runs (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references salary_companies(id) on delete cascade,
  year              integer not null,
  month             integer not null check (month between 1 and 12),

  status            text not null default 'draft'
                      check (status in ('draft','approved')),

  -- Settings frozen at the time of the run, so a later settings change never
  -- rewrites a month that has already been paid.
  pay_divisor_basis text not null default 'calendar',
  calendar_days     integer not null,
  working_days      integer not null,
  tiffin_rate       numeric(10,2) not null default 10,

  -- Letter fields.
  cheque_no         text,
  letter_date       date,
  value_date        date,

  neft_total        numeric(14,2) not null default 0,
  cash_total        numeric(14,2) not null default 0,
  grand_total       numeric(14,2) not null default 0,

  -- True for months imported from the old workbooks rather than calculated here.
  is_historical     boolean not null default false,
  notes             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  approved_at       timestamptz,
  unique (company_id, year, month)
);

drop trigger if exists salary_runs_updated_at on salary_runs;
create trigger salary_runs_updated_at before update on salary_runs
  for each row execute function salary_set_updated_at();

-- ---------------------------------------------------------------- run lines

create table if not exists salary_run_lines (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references salary_runs(id) on delete cascade,
  employee_id       uuid references salary_employees(id) on delete set null,

  -- Snapshots, so historical payslips stay correct after a master-data edit.
  employee_name     text not null,
  beneficiary_name  text not null,
  bank_ifsc         text,
  bank_account_no   text,
  bank_account_type text not null default 'SB',

  monthly_pay       numeric(12,2) not null default 0,
  absence           numeric(5,1)  not null default 0,
  leave_pay         numeric(5,1)  not null default 0,
  days_present      numeric(5,1)  not null default 0,
  tiffin            numeric(10,2) not null default 0,
  gross             numeric(14,2) not null default 0,
  ptax              numeric(10,2) not null default 0,
  tds               numeric(14,2) not null default 0,
  advance           numeric(14,2) not null default 0,
  net               numeric(14,2) not null default 0,
  payable           numeric(14,2) not null default 0,
  rounded           numeric(14,2) not null default 0,

  pay_mode          text not null default 'neft'
                      check (pay_mode in ('neft','cash','excluded')),
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists salary_run_lines_run_idx
  on salary_run_lines (run_id, sort_order);

-- ---------------------------------------------------------------- neft rows

-- One row per line in the bank upload file. A single run line can produce
-- several of these, because HDFC requires a minimum number of transactions.
create table if not exists salary_neft_rows (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references salary_runs(id) on delete cascade,
  run_line_id  uuid not null references salary_run_lines(id) on delete cascade,
  seq          integer not null,
  amount       numeric(14,2) not null,
  created_at   timestamptz not null default now()
);

create index if not exists salary_neft_rows_run_idx
  on salary_neft_rows (run_id, seq);

-- --------------------------------------------------------------------- RLS

alter table salary_companies  enable row level security;
alter table salary_employees  enable row level security;
alter table salary_holidays   enable row level security;
alter table salary_attendance enable row level security;
alter table salary_runs       enable row level security;
alter table salary_run_lines  enable row level security;
alter table salary_neft_rows  enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'salary_companies','salary_employees','salary_holidays',
    'salary_attendance','salary_runs','salary_run_lines','salary_neft_rows'
  ] loop
    execute format('drop policy if exists %I on %I', t || '_authenticated', t);
    -- Single-operator app: any signed-in user has full access; anon has none.
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true)',
      t || '_authenticated', t
    );
  end loop;
end $$;
