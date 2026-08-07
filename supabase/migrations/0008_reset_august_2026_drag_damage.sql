-- Reset August 2026 attendance to its state before 2026-08-07.
--
-- Committing a drag used to pair every touched employee with every touched
-- date, so a diagonal drag wrote the whole rectangle rather than the cells the
-- hand crossed. On 2026-08-07 that put 28 invented absences into the register
-- — four employees against seven days, one identical timestamp — along with a
-- few other marks from the same run.
--
-- The rectangle destroys the information needed to tell an intended cell from
-- an invented one, so nothing is reconstructed here. August goes back to where
-- it was before that day and is re-marked by hand on the fixed code.
--
-- Marks written before 2026-08-07 are genuine and left alone: Shambhu Prasad
-- Singh's absences on 1-8 August, recorded on the 6th, survive untouched.
--
-- End state, matching the figure verified twice before the damage:
--   390 rows, 8 absences, no paid leave.

update salary_attendance
   set status = 'present'
 where marked_on between '2026-08-01' and '2026-08-31'
   and updated_at >= '2026-08-07 00:00:00+00'
   and status <> 'present';

-- Sukumar Sardar's 8 August absence predates the damage and is real; the same
-- run knocked it to paid_leave, so it is put back.
update salary_attendance a
   set status = 'absent'
  from salary_employees e
 where e.id = a.employee_id
   and e.name = 'SUKUMAR SARDAR'
   and a.marked_on = '2026-08-08';
