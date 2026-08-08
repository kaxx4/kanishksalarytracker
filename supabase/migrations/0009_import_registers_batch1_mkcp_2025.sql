-- Paper-register import, batch 1: MKCP April and May 2025.
--
-- Transcribed from the photographed Form M pay registers. Each month is
-- checked against the two totals the register prints for itself, which is what
-- makes an eye-transcription trustworthy: one wrong digit and the sum breaks.
--
--   April 2025   93,181 + 550 =  93,731
--   May   2025   93,949 + 680 =  94,629
--
-- Import rules, as decided with the operator:
--   * Staff no longer on any roster get real employee rows, marked inactive,
--     so months reconcile and nobody is orphaned.
--   * Rahul Sarkar and Abhishek Kumar keep their single existing records —
--     they later moved to Calcutta Traders — so a line on an MKCP run may
--     point at a CT employee. Deliberate, and it keeps one person's history
--     continuous across the move.
--   * Months already stored are never overwritten; differences are reported.
--
-- Derived fields follow the payroll model so the bonus engine stays correct:
-- gross = paid + ptax, net = payable = the register's paid figure. The
-- "Deductions" column of the register is where tiffin is written.

insert into salary_employees (
  company_id, name, beneficiary_name, monthly_pay, tiffin_eligible,
  default_pay_mode, bank_account_type, active, is_director, sort_order
)
select c.id, v.nm, v.nm, v.pay, false, 'neft', '10', false, false, v.ord
from salary_companies c,
     (values ('UPENDER KUMAR', 13900, 20),
             ('SATYAJIT DEY ADHICARY', 16000, 21),
             ('SONU DAS', 15000, 22)) as v(nm, pay, ord)
where c.code = 'MKCP'
  and not exists (select 1 from salary_employees e where e.name = v.nm);

-- April 2025: 30 days, 4 Sundays, 26 working.
insert into salary_runs (
  company_id, year, month, status, pay_divisor_basis, calendar_days, working_days,
  tiffin_rate, neft_total, cash_total, grand_total, is_historical, approved_at, notes
)
select c.id, 2025, 4, 'approved', 'calendar', 30, 26, c.tiffin_rate,
       93181, 0, 93181, true, now(),
       'Imported from the Form M pay register photograph. Salary 93,181 + P.Tax 550 = 93,731, matching the register total.'
from salary_companies c
where c.code = 'MKCP'
  and not exists (select 1 from salary_runs r where r.company_id=c.id and r.year=2025 and r.month=4);

with reg(nm, rate, ab, lv, tif, ptx, paid, ord) as (values
  ('SATINDER RAJBANSHI',    13900, 16, 2,   0,   0,  7414, 1),
  ('RANJIT RAJBANSHI',      13900,  2, 2,   0, 110, 13790, 2),
  ('SHAMBHU PRASAD SINGH',  13900,  0, 0,   0, 110, 13790, 3),
  ('UPENDER KUMAR',         13900,  0, 0,   0, 110, 13790, 4),
  ('MAHESH RAM',            13900, 18, 2,   0,   0,  6487, 5),
  ('SHATRUDAHAN',           13900,  0, 0,   0, 110, 13790, 6),
  ('RAHUL SARKAR',          13000,  1, 1, 250, 110, 13140, 7),
  ('SATYAJIT DEY ADHICARY', 16000, 22, 0,  40,   0,  2173, 8),
  ('ABHISHEK KUMAR',        13000, 12, 2, 140,   0,  8807, 9)
)
insert into salary_run_lines (
  run_id, employee_id, employee_name, beneficiary_name, bank_ifsc, bank_account_no,
  bank_account_type, monthly_pay, absence, leave_pay, days_present, tiffin,
  gross, ptax, tds, advance, net, payable, rounded, pay_mode, sort_order
)
select r.id, e.id, e.name, e.beneficiary_name, e.bank_ifsc, e.bank_account_no,
       e.bank_account_type, reg.rate, reg.ab, reg.lv, greatest(26 - reg.ab, 0), reg.tif,
       reg.paid + reg.ptx, reg.ptx, 0, 0, reg.paid, reg.paid, reg.paid, 'neft', reg.ord
from reg
join salary_employees e on e.name = reg.nm
join salary_companies c on c.code = 'MKCP'
join salary_runs r on r.company_id = c.id and r.year = 2025 and r.month = 4
where not exists (select 1 from salary_run_lines l where l.run_id = r.id);

-- May 2025: 31 days, 4 Sundays, 27 working.
insert into salary_runs (
  company_id, year, month, status, pay_divisor_basis, calendar_days, working_days,
  tiffin_rate, neft_total, cash_total, grand_total, is_historical, approved_at, notes
)
select c.id, 2025, 5, 'approved', 'calendar', 31, 27, c.tiffin_rate,
       93949, 0, 93949, true, now(),
       'Imported from the Form M pay register photograph. Salary 93,949 + P.Tax 680 = 94,629, matching the register total.'
from salary_companies c
where c.code = 'MKCP'
  and not exists (select 1 from salary_runs r where r.company_id=c.id and r.year=2025 and r.month=5);

with reg(nm, rate, ab, lv, tif, ptx, paid, ord) as (values
  ('SATINDER RAJBANSHI',   13900, 10, 3,   0, 110, 10652, 1),
  ('RANJIT RAJBANSHI',     13900, 19, 3,   0,   0,  6726, 2),
  ('SHAMBHU PRASAD SINGH', 13900,  0, 0,   0, 110, 13790, 3),
  ('UPENDER KUMAR',        13900,  0, 0,   0, 110, 13790, 4),
  ('MAHESH RAM',           13900,  0, 0,   0, 110, 13790, 5),
  ('SHATRUDAHAN',          13900,  0, 0,   0, 110, 13790, 6),
  ('RAMNARESH BHAGAT',     15000, 18, 0,   0,   0,  6291, 7),
  ('SONU DAS',             15000,  1, 1, 250, 130, 15120, 8)
)
insert into salary_run_lines (
  run_id, employee_id, employee_name, beneficiary_name, bank_ifsc, bank_account_no,
  bank_account_type, monthly_pay, absence, leave_pay, days_present, tiffin,
  gross, ptax, tds, advance, net, payable, rounded, pay_mode, sort_order
)
select r.id, e.id, e.name, e.beneficiary_name, e.bank_ifsc, e.bank_account_no,
       e.bank_account_type, reg.rate, reg.ab, reg.lv, greatest(27 - reg.ab, 0), reg.tif,
       reg.paid + reg.ptx, reg.ptx, 0, 0, reg.paid, reg.paid, reg.paid, 'neft', reg.ord
from reg
join salary_employees e on e.name = reg.nm
join salary_companies c on c.code = 'MKCP'
join salary_runs r on r.company_id = c.id and r.year = 2025 and r.month = 5
where not exists (select 1 from salary_run_lines l where l.run_id = r.id);
