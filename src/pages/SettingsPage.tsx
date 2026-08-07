import { useEffect, useMemo, useState } from 'react'

import { WB_PTAX_SLABS } from '../calc/payroll.ts'
import { inr, letterDate, rupees } from '../lib/format.ts'
import { useStore } from '../store/useStore.ts'
import type { DayBasis, Holiday, PtaxSlab, RoundRule } from '../types.ts'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ROUND_RULES: { value: RoundRule; label: string }[] = [
  { value: 'up', label: 'Round up' },
  { value: 'nearest', label: 'Nearest' },
  { value: 'down', label: 'Round down' },
]

export default function SettingsPage() {
  const { companies, activeCompanyId, updateCompany, holidays, addHoliday, removeHoliday } = useStore()
  const company = companies.find((c) => c.id === activeCompanyId)

  if (!company) return <p className="font-mono text-xs text-ink-3">No company selected.</p>

  // updateCompany already reports success/failure via the shared toast, so
  // this is just a thin pass-through kept for the call-site shorthand below.
  const save = (patch: Parameters<typeof updateCompany>[0]) => updateCompany(patch)

  const companyHolidays = holidays
    .filter((h) => h.company_id === company.id)
    .sort((a, b) => a.holiday_on.localeCompare(b.holiday_on))

  const toggleOff = (day: number) => {
    const current = company.weekly_off_days ?? [0]
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()
    void save({ weekly_off_days: next })
  }

  return (
    // grid-cols + min-w-0 on the sections: without both, each card's min-content
    // width sets the column and the page scrolls sideways on a phone.
    <div className="grid max-w-4xl grid-cols-[minmax(0,1fr)] gap-6 [&>section]:min-w-0">
      {/* ------------------------------------------------------ the entity */}
      <section className="rise space-y-2">
        <div className="rubric">
          <span>Entity</span>
        </div>
        <div className="leaf p-5">
          <h3 className="font-display text-2xl leading-tight">{company.name}</h3>
          <p className="mt-1 font-mono text-[11px] text-ink-3">{company.address_line}</p>

          <dl className="mt-4 grid gap-x-10 sm:grid-cols-2">
            <Row label="Remitter name" value={company.remitter_name} />
            <Row label="Current account" value={company.account_no} num />
            <Row label="Branch code" value={company.branch_code} num />
            <Row label="GSTIN" value={company.gst_no ?? '—'} num />
            {company.cin_no && <Row label="CIN" value={company.cin_no} num />}
            <Row label="Bank" value={`${company.bank_name}, ${company.bank_branch}`} />
          </dl>
        </div>
      </section>

      {/* -------------------------------------------------- how pay is struck */}
      <section className="rise space-y-2" style={{ animationDelay: '70ms' }}>
        <div className="rubric">
          <span>How pay is struck</span>
        </div>

        <div className="leaf divide-y divide-rule">
          <div className="p-5">
            <label className="label">Monthly pay is divided by</label>
            <div className="flex gap-0">
              {(['calendar', 'working'] as DayBasis[]).map((basis) => (
                <button
                  key={basis}
                  onClick={() => void save({ pay_divisor_basis: basis })}
                  className={`-ml-px border px-4 py-2 font-mono text-[11px] uppercase
                    tracking-[.13em] transition-colors first:ml-0 first:rounded-l-[3px]
                    last:rounded-r-[3px] ${
                      company.pay_divisor_basis === basis
                        ? 'z-10 border-ink bg-ink text-paper-raised'
                        : 'border-rule-strong bg-paper-raised text-ink-3 hover:text-ink'
                    }`}
                >
                  {basis === 'calendar' ? 'Calendar days' : 'Working days'}
                </button>
              ))}
            </div>
            <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-ink-2">
              Your workbooks have always divided by calendar days while counting absence and
              tiffin on working days. Moving to working days raises the per-day rate, so the same
              absence costs the employee more. Months already approved are never recalculated.
            </p>
          </div>

          <div className="p-5">
            <label className="label">Tiffin rate — per day present</label>
            <input
              className="input tnum w-32"
              type="number"
              defaultValue={company.tiffin_rate}
              onBlur={(e) => void save({ tiffin_rate: Number(e.target.value) })}
            />
            <p className="mt-3 text-[13px] text-ink-2">
              Currently {rupees(company.tiffin_rate)}/day, applied only to employees marked
              tiffin-eligible.
            </p>
          </div>

          <div className="p-5">
            <label className="label">Weekly off</label>
            <div className="flex flex-wrap gap-0">
              {WEEKDAYS.map((name, day) => {
                const off = (company.weekly_off_days ?? []).includes(day)
                return (
                  <button
                    key={name}
                    onClick={() => toggleOff(day)}
                    className={`-ml-px border px-3.5 py-2 font-mono text-[11px] uppercase
                      tracking-[.13em] transition-colors first:ml-0 first:rounded-l-[3px]
                      last:rounded-r-[3px] ${
                        off
                          ? 'z-10 border-ink bg-ink text-paper-raised'
                          : 'border-rule-strong bg-paper-raised text-ink-4 hover:text-ink'
                      }`}
                  >
                    {name}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="p-5">
            <label className="label">Rounding</label>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-0">
                {ROUND_RULES.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => void save({ round_rule: value })}
                    className={`-ml-px border px-4 py-2 font-mono text-[11px] uppercase
                      tracking-[.13em] transition-colors first:ml-0 first:rounded-l-[3px]
                      last:rounded-r-[3px] ${
                        company.round_rule === value
                          ? 'z-10 border-ink bg-ink text-paper-raised'
                          : 'border-rule-strong bg-paper-raised text-ink-3 hover:text-ink'
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[.1em] text-ink-4">
                to nearest
              </span>
              <select
                className="input w-auto py-1.5"
                value={company.round_unit}
                onChange={(e) => void save({ round_unit: Number(e.target.value) })}
              >
                <option value={1}>Rupee</option>
                <option value={10}>Ten rupees</option>
              </select>
            </div>
            <p className="mt-3 max-w-prose text-[13px] text-ink-2">
              Applied to the final payable amount before it reaches the bank file.{' '}
              <span className="font-medium">Round up</span> to the rupee is the historical
              behaviour — the workbooks never shorted an employee by rounding down. Months already
              approved keep the amounts they were struck with.
            </p>
          </div>

          <div className="p-5">
            <label className="label">Minimum bank-file rows</label>
            <input
              className="input tnum w-32"
              type="number"
              defaultValue={company.min_neft_rows}
              onBlur={(e) => void save({ min_neft_rows: Number(e.target.value) })}
            />
            <p className="mt-3 max-w-prose text-[13px] text-ink-2">
              HDFC rejects a bulk upload with fewer transactions than this, so payments are split
              across rows to reach it.
            </p>
          </div>

          <div className="p-5">
            <label className="label">Split-chunk size</label>
            <input
              className="input tnum w-32"
              type="number"
              defaultValue={company.neft_split_chunk}
              onBlur={(e) => {
                const v = Number(e.target.value)
                if (v > 0) void save({ neft_split_chunk: v })
              }}
            />
            <p className="mt-3 max-w-prose text-[13px] text-ink-2">
              A payment above this is peeled off in chunks of this size to help reach the row
              minimum — currently {rupees(company.neft_split_chunk)} at a time, matching the cuts
              in the original bank files.
            </p>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- holidays */}
      <section className="rise space-y-2" style={{ animationDelay: '110ms' }}>
        <div className="rubric">
          <span>Holidays</span>
          <span className="ml-auto normal-case tracking-normal text-ink-4">
            {company.code} · reduces working days, so absence and tiffin cost less
          </span>
        </div>
        <HolidayEditor
          holidays={companyHolidays}
          onAdd={addHoliday}
          onRemove={removeHoliday}
        />
      </section>

      {/* ------------------------------------------------------------ p-tax */}
      <section className="rise space-y-2" style={{ animationDelay: '170ms' }}>
        <div className="rubric">
          <span>Profession tax</span>
          <span className="ml-auto normal-case tracking-normal text-ink-4">
            {company.code} · charged on the month's actual gross
          </span>
        </div>
        <PtaxEditor
          slabs={company.ptax_slabs}
          onSave={(ptax_slabs) => save({ ptax_slabs })}
        />
      </section>
    </div>
  )
}

/**
 * Editable slab table.
 *
 * The bands are contiguous by construction: only the upper bound of each band
 * is entered, and the lower bound is derived from the band above it. The last
 * band is always open-ended, so there can be no gap and no uncovered gross.
 *
 * Edits are staged locally and only written when they validate, so a half-typed
 * bound can never reach the database and silently mis-deduct a month.
 */
function PtaxEditor({
  slabs, onSave,
}: {
  slabs: PtaxSlab[]
  onSave: (slabs: PtaxSlab[]) => Promise<void> | void
}) {
  const [draft, setDraft] = useState<PtaxSlab[]>(slabs)
  const [touched, setTouched] = useState(false)

  // Re-sync when the company changes underneath us.
  useEffect(() => {
    setDraft(slabs)
    setTouched(false)
  }, [slabs])

  const dirty = touched && JSON.stringify(draft) !== JSON.stringify(slabs)

  const errors = useMemo(() => {
    const out: string[] = []
    if (draft.length === 0) out.push('There must be at least one band.')
    draft.forEach((slab, i) => {
      const last = i === draft.length - 1
      if (!last && (slab.upto === null || !Number.isFinite(slab.upto))) {
        out.push(`Band ${i + 1} needs an upper limit.`)
      }
      if (!last && i > 0) {
        const prev = draft[i - 1].upto
        if (prev !== null && slab.upto !== null && slab.upto <= prev) {
          out.push(`Band ${i + 1} must end above ${inr(prev)}.`)
        }
      }
      if (slab.amount < 0) out.push(`Band ${i + 1} cannot be negative.`)
    })
    return out
  }, [draft])

  // The Constitution caps profession tax at Rs 2,500 a year, so anything above
  // Rs 208 a month cannot be lawfully deducted for twelve months.
  const annualMax = Math.max(...draft.map((s) => s.amount), 0) * 12
  const overCap = annualMax > 2500

  const update = (i: number, patch: Partial<PtaxSlab>) => {
    setTouched(true)
    setDraft((d) => d.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  const addBand = () => {
    setTouched(true)
    setDraft((d) => {
      const openEnded = d[d.length - 1]
      const previous = d.length > 1 ? d[d.length - 2].upto ?? 0 : 0
      const inserted: PtaxSlab = { upto: previous + 5000, amount: openEnded?.amount ?? 0 }
      return [...d.slice(0, -1), inserted, openEnded ?? { upto: null, amount: 0 }]
    })
  }

  const removeBand = (i: number) => {
    setTouched(true)
    setDraft((d) => {
      const next = d.filter((_, idx) => idx !== i)
      // Whatever ends up last must stay the open-ended band.
      if (next.length) next[next.length - 1] = { ...next[next.length - 1], upto: null }
      return next
    })
  }

  return (
    <div className="leaf overflow-hidden">
      <table className="w-full max-w-2xl">
        <thead>
          <tr>
            <th className="th">Band</th>
            <th className="th text-right">Up to (monthly gross)</th>
            <th className="th text-right">Tax per month</th>
            <th className="th" />
          </tr>
        </thead>
        <tbody>
          {draft.map((slab, i) => {
            const last = i === draft.length - 1
            const from = i === 0 ? 0 : (draft[i - 1].upto ?? 0) + 1
            return (
              <tr key={i} className="transition-colors hover:bg-paper-sunk/60">
                <td className="td tnum text-ink-2">
                  {last ? `Above ${inr(from - 1)}` : `From ${inr(from)}`}
                </td>
                <td className="td text-right">
                  {last ? (
                    <span className="font-mono text-[10px] uppercase tracking-[.1em] text-ink-4">
                      and above
                    </span>
                  ) : (
                    <input
                      className="tnum w-32 rounded-[2px] border border-transparent bg-transparent
                                 px-1.5 py-0.5 text-right text-sm transition-colors
                                 hover:border-rule-strong focus:border-vermillion
                                 focus:bg-paper-raised"
                      type="number"
                      value={slab.upto ?? ''}
                      onChange={(e) => update(i, { upto: Number(e.target.value) })}
                    />
                  )}
                </td>
                <td className="td text-right">
                  <input
                    className="tnum w-24 rounded-[2px] border border-transparent bg-transparent
                               px-1.5 py-0.5 text-right text-sm font-medium transition-colors
                               hover:border-rule-strong focus:border-vermillion
                               focus:bg-paper-raised"
                    type="number"
                    value={slab.amount}
                    onChange={(e) => update(i, { amount: Number(e.target.value) })}
                  />
                </td>
                <td className="td text-right">
                  <button
                    className="btn-ghost !px-2 !py-0.5"
                    disabled={draft.length <= 1}
                    onClick={() => removeBand(i)}
                    title="Remove this band"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-2 border-t border-rule p-4">
        <button className="btn-secondary" onClick={addBand}>
          Add band
        </button>
        <button
          className="btn-ghost"
          onClick={() => {
            setTouched(true)
            setDraft(WB_PTAX_SLABS)
          }}
        >
          Restore W.B. schedule
        </button>

        <div className="ml-auto flex items-center gap-2">
          {dirty && (
            <button
              className="btn-ghost"
              onClick={() => {
                setDraft(slabs)
                setTouched(false)
              }}
            >
              Revert
            </button>
          )}
          <button
            className="btn-primary"
            disabled={!dirty || errors.length > 0}
            onClick={() => void onSave(draft)}
          >
            {dirty ? 'Save slabs' : 'Saved'}
          </button>
        </div>
      </div>

      {errors.length > 0 && (
        <ul className="border-t border-vermillion/30 bg-vermillion-wash px-4 py-3 text-[13px]
                       text-vermillion-deep">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      {overCap && errors.length === 0 && (
        <p className="border-t border-ochre/40 bg-ochre-wash px-4 py-3 text-[13px] text-ink-2">
          The top band works out to <span className="tnum">{rupees(annualMax)}</span> a year.
          Article 276 caps profession tax at <span className="tnum">₹2,500</span> a year, so this
          cannot lawfully be deducted for all twelve months.
        </p>
      )}

      <p className="max-w-prose border-t border-rule p-4 text-[13px] leading-relaxed text-ink-2">
        Bands are contiguous — each one starts where the previous ends, and the last is
        open-ended, so no level of gross is left uncovered. Slabs apply to future runs only;
        months already approved keep the tax they were struck with.
      </p>
    </div>
  )
}

/**
 * Company holidays — the piece of the working-days calculation that had no
 * editor at all before this. A holiday removes a day from working days the
 * same way a weekly off does, so absence and tiffin cost less on that day.
 */
function HolidayEditor({
  holidays, onAdd, onRemove,
}: {
  holidays: Holiday[]
  onAdd: (holidayOn: string, name: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)

  const submit = async () => {
    if (!date) return
    setAdding(true)
    try {
      await onAdd(date, name)
      setDate('')
      setName('')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="leaf overflow-hidden">
      {holidays.length === 0 ? (
        <p className="p-5 text-[13px] text-ink-3">No holidays recorded for this company yet.</p>
      ) : (
        <ul>
          {holidays.map((h) => (
            <li
              key={h.id}
              className="flex items-center gap-3 border-b border-rule px-5 py-2.5 last:border-b-0"
            >
              <span className="tnum w-24 text-sm">{letterDate(h.holiday_on)}</span>
              <span className="flex-1 text-sm text-ink-2">{h.name || '—'}</span>
              <button className="btn-ghost !px-2 !py-0.5" onClick={() => void onRemove(h.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-3 border-t border-rule p-4">
        <div>
          <label className="label">Date</label>
          <input
            className="input w-40"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <label className="label">Occasion</label>
          <input
            className="input"
            placeholder="e.g. Durga Puja"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button className="btn-primary" disabled={!date || adding} onClick={() => void submit()}>
          {adding ? 'Adding…' : 'Add holiday'}
        </button>
      </div>
    </div>
  )
}

function Row({ label, value, num }: { label: string; value: string; num?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule py-2">
      <dt className="font-mono text-[10px] uppercase tracking-[.1em] text-ink-3">{label}</dt>
      <dd className={num ? 'tnum text-[13px]' : 'text-[13px]'}>{value}</dd>
    </div>
  )
}
