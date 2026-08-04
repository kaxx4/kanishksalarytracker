-- Half-day is not a concept this business uses — attendance is strictly
-- present/absent/paid-leave. No half_day rows exist in salary_attendance
-- (verified before writing this migration), so no data conversion is needed.

alter table salary_companies drop column if exists half_day_weight;

alter table salary_attendance drop constraint if exists salary_attendance_status_check;
alter table salary_attendance add constraint salary_attendance_status_check
  check (status in ('present', 'absent', 'paid_leave', 'holiday'));
