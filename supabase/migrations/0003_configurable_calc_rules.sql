-- Every remaining piece of hardcoded calculation logic becomes a per-company
-- setting: NEFT split-chunk size, rounding rule/unit, and the weight a half-day
-- carries against absence. Defaults match the behaviour already in production,
-- so existing months are unaffected until someone deliberately changes them.

alter table salary_companies
  add column if not exists round_rule text not null default 'up'
    check (round_rule in ('up', 'nearest', 'down')),
  add column if not exists round_unit numeric(6,2) not null default 1,
  add column if not exists neft_split_chunk numeric(12,2) not null default 10000,
  add column if not exists half_day_weight numeric(3,2) not null default 0.5
    check (half_day_weight >= 0 and half_day_weight <= 1);

comment on column salary_companies.round_rule is
  'How a line''s net payable is rounded before it reaches the bank file: up (never round down what''s owed), nearest, or down.';
comment on column salary_companies.round_unit is
  'Rounding granularity in rupees — 1 for whole-rupee rounding, 10 to round to the nearest ten.';
comment on column salary_companies.neft_split_chunk is
  'HDFC bulk NEFT requires a minimum row count; a payment above this is split off in chunks of this size to help reach it.';
comment on column salary_companies.half_day_weight is
  'Fraction of a full day a half-day mark counts against attendance (0.5 = half absent, half present).';
