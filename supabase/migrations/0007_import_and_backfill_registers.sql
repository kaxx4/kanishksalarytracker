-- Import and backfill from the photographed Form M pay registers.
--
-- Seven photos turned out to hold four distinct registers. Two of those months
-- (MKCP April and May 2026) were never in the database at all; two more were
-- imported amounts-only, so their lines carried a paid figure and nothing else
-- — no rate, no absence, no P.Tax — which left the Form M export printing
-- dashes and the bonus engine reading a wage of `payable` alone.
--
-- Every transcription below is checked against the register's own two printed
-- totals. That is a genuine check, not a formality: a single misread digit
-- breaks the sum. It caught one here — Shatrudahan's April figure read as
-- 15,500 until the salary total came out 20 short, and is 15,520.
--
--   CT   May 2026    1,32,871  +  850  =  1,33,721
--   MKCP April 2026  1,04,793  +  890  =  1,05,683
--   MKCP May 2026      97,125  +  650  =    97,775
--   MKCP June 2026   1,19,944  + 1,020 =  1,20,964
--
-- Paid amounts are never altered — the existing months already had them right
-- and they match the bank letters. This only fills in the detail beside them.
--
-- Derived fields follow the payroll model so the bonus engine stays correct:
-- gross = payable + ptax, net = payable, payable = the register's paid figure.
-- MKCP staff are not tiffin-eligible and their registers show a dash in that
-- column, so tiffin stays zero there.

-- ---------------------------------------------------------------- CT May 2026
with reg(nm, rate, ab, lv, tif, ptx) as (values
  ('DINESH RAM',       15840, 27, 2,  30,   0),
  ('SUKUMAR SARDAR',   15760,  4, 2, 210, 110),
  ('SURAJIT PAL',      35500,  1, 1, 240, 150),
  ('BIRENDER KR SHAW', 15490,  1, 1, 240, 130),
  ('BAPI MONDAL',      15490,  9, 2, 170, 110),
  ('AVIJIT PAL',       18500,  2, 2, 230, 130),
  ('VIKASH KUMAR RAO', 15240,  4, 2, 210, 110),
  ('RAHUL SARKAR',     14750,  2, 2, 230, 110),
  ('ABHISHEK KUMAR',   14750, 26, 2,  40,   0)
)
update salary_run_lines l set
  monthly_pay  = reg.rate,
  absence      = reg.ab,
  leave_pay    = reg.lv,
  tiffin       = reg.tif,
  ptax         = reg.ptx,
  days_present = greatest(r.working_days - reg.ab, 0),
  payable      = l.rounded,
  net          = l.rounded,
  gross        = l.rounded + reg.ptx
from reg, salary_runs r, salary_companies c
where l.run_id = r.id and r.company_id = c.id
  and c.code = 'CT' and r.year = 2026 and r.month = 5
  and l.employee_name = reg.nm;

-- -------------------------------------------------------------- MKCP June 2026
with reg(nm, rate, ab, lv, ptx) as (values
  ('SATINDER RAJBANSHI',   15650,  0, 0, 130),
  ('RANJIT RAJBANSHI',     15650,  0, 0, 130),
  ('SHAMBHU PRASAD SINGH', 15650,  0, 0, 130),
  ('MAHESH RAM',           15650,  0, 0, 130),
  ('SHATRUDAHAN',          15650,  0, 0, 130),
  ('BHARAT RAM',           15650,  0, 0, 130),
  ('RAMNARESH BHAGAT',     17000, 16, 6, 110),
  ('SUNIL KUMAR TIWARI',   18000,  0, 0, 130)
)
update salary_run_lines l set
  monthly_pay  = reg.rate,
  absence      = reg.ab,
  leave_pay    = reg.lv,
  ptax         = reg.ptx,
  days_present = greatest(r.working_days - reg.ab, 0),
  payable      = l.rounded,
  net          = l.rounded,
  gross        = l.rounded + reg.ptx
from reg, salary_runs r, salary_companies c
where l.run_id = r.id and r.company_id = c.id
  and c.code = 'MKCP' and r.year = 2026 and r.month = 6
  and l.employee_name = reg.nm;

-- ------------------------------------------- MKCP April 2026 (not previously held)
-- April 2026: 30 calendar days, 4 Sundays, 26 working days.
-- The eighth line of the register is a name not on the roster with no amount
-- against it, so nothing is imported for it.
insert into salary_runs (
  company_id, year, month, status, pay_divisor_basis, calendar_days, working_days,
  tiffin_rate, cheque_no, letter_date, value_date,
  neft_total, cash_total, grand_total, is_historical, approved_at, notes
)
select c.id, 2026, 4, 'approved', 'calendar', 30, 26, c.tiffin_rate, null, null, null,
       104793, 0, 104793, true, now(),
       'Imported from the Form M pay register photograph. Salary 1,04,793 + P.Tax 890 = 1,05,683, matching the register total. No cheque number legible.'
from salary_companies c
where c.code = 'MKCP'
  and not exists (
    select 1 from salary_runs r where r.company_id = c.id and r.year = 2026 and r.month = 4
  );

with reg(nm, rate, ab, lv, ptx, paid, ord) as (values
  ('SATINDER RAJBANSHI',   15650,  0, 0, 130, 15520, 1),
  ('RANJIT RAJBANSHI',     15650,  4, 3, 130, 14998, 2),
  ('SHAMBHU PRASAD SINGH', 15650, 11, 3, 110, 11367, 3),
  ('MAHESH RAM',           15650,  4, 3, 130, 14998, 4),
  ('SHATRUDAHAN',          15650,  0, 0, 130, 15520, 5),
  ('BHARAT RAM',           15650,  0, 0, 130, 15520, 6),
  ('RAMNARESH BHAGAT',     17000,  0, 0, 130, 16870, 7)
)
insert into salary_run_lines (
  run_id, employee_id, employee_name, beneficiary_name, bank_ifsc, bank_account_no,
  bank_account_type, monthly_pay, absence, leave_pay, days_present, tiffin,
  gross, ptax, tds, advance, net, payable, rounded, pay_mode, sort_order
)
select r.id, e.id, e.name, e.beneficiary_name, e.bank_ifsc, e.bank_account_no,
       e.bank_account_type, reg.rate, reg.ab, reg.lv, greatest(26 - reg.ab, 0), 0,
       reg.paid + reg.ptx, reg.ptx, 0, 0, reg.paid, reg.paid, reg.paid, 'neft', reg.ord
from reg
join salary_companies c on c.code = 'MKCP'
join salary_employees e on e.company_id = c.id and e.name = reg.nm
join salary_runs r on r.company_id = c.id and r.year = 2026 and r.month = 4
where not exists (select 1 from salary_run_lines l where l.run_id = r.id);

-- --------------------------------------------- MKCP May 2026 (not previously held)
-- May 2026: 31 calendar days, 5 Sundays, 26 working days.
-- Ranjit's and Mahesh's AS/Ad cells are overwritten in the photograph and could
-- not be read with confidence, so their docked days are the figure the paid
-- amount implies (15,650/31 x 19 = 9,592 and x 17 = 8,583) recorded as absence
-- with no leave credited. The paid amounts and P.Tax themselves are legible and
-- reconcile against both register totals.
insert into salary_runs (
  company_id, year, month, status, pay_divisor_basis, calendar_days, working_days,
  tiffin_rate, cheque_no, letter_date, value_date,
  neft_total, cash_total, grand_total, is_historical, approved_at, notes
)
select c.id, 2026, 5, 'approved', 'calendar', 31, 26, c.tiffin_rate, null, null, null,
       97125, 0, 97125, true, now(),
       'Imported from the Form M pay register photograph. Salary 97,125 + P.Tax 650 = 97,775, matching the register total. No cheque number legible. Ranjit Rajbanshi and Mahesh Ram carry derived absence days — see migration comment.'
from salary_companies c
where c.code = 'MKCP'
  and not exists (
    select 1 from salary_runs r where r.company_id = c.id and r.year = 2026 and r.month = 5
  );

with reg(nm, rate, ab, lv, ptx, paid, ord) as (values
  ('SATINDER RAJBANSHI',   15650,  0, 0, 130, 15520, 1),
  ('RANJIT RAJBANSHI',     15650, 12, 0,   0,  9592, 2),
  ('SHAMBHU PRASAD SINGH', 15650,  0, 0, 130, 15520, 3),
  ('MAHESH RAM',           15650, 14, 0,   0,  8583, 4),
  ('SHATRUDAHAN',          15650,  0, 0, 130, 15520, 5),
  ('BHARAT RAM',           15650,  0, 0, 130, 15520, 6),
  ('RAMNARESH BHAGAT',     17000,  0, 0, 130, 16870, 7)
)
insert into salary_run_lines (
  run_id, employee_id, employee_name, beneficiary_name, bank_ifsc, bank_account_no,
  bank_account_type, monthly_pay, absence, leave_pay, days_present, tiffin,
  gross, ptax, tds, advance, net, payable, rounded, pay_mode, sort_order
)
select r.id, e.id, e.name, e.beneficiary_name, e.bank_ifsc, e.bank_account_no,
       e.bank_account_type, reg.rate, reg.ab, reg.lv, greatest(26 - reg.ab, 0), 0,
       reg.paid + reg.ptx, reg.ptx, 0, 0, reg.paid, reg.paid, reg.paid, 'neft', reg.ord
from reg
join salary_companies c on c.code = 'MKCP'
join salary_employees e on e.company_id = c.id and e.name = reg.nm
join salary_runs r on r.company_id = c.id and r.year = 2026 and r.month = 5
where not exists (select 1 from salary_run_lines l where l.run_id = r.id);
