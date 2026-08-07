-- Form M (Rule 30) prints two details the app did not hold anywhere: the
-- employer's name and the establishment's registration number. Both are
-- printed on the statutory pay register, so they belong with the company
-- rather than hardcoded in the export, and both are editable under Settings.
--
-- Additive and nullable: existing rows keep working untouched, and a blank
-- value simply prints the empty ruled line the original register carries.

alter table salary_companies
  add column if not exists employer_name   text,
  add column if not exists registration_no text;

comment on column salary_companies.employer_name is
  'Name of Employer/Shop-keeper, as printed on the Form M pay register.';
comment on column salary_companies.registration_no is
  'Establishment registration number printed on Form M. Blank on both of the
   photographed registers, so it is allowed to stay null.';

-- Seed the one value legible on the photographed registers. MKCP is left null
-- deliberately — its entry is overwritten in the photo and must not be guessed.
update salary_companies
   set employer_name = 'MR. V.N. AGARWAL'
 where code = 'CT'
   and employer_name is null;
