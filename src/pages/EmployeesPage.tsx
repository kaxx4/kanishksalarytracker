import { useState } from 'react'

import { inr } from '../lib/format.ts'
import { useStore } from '../store/useStore.ts'
import type { Employee, PayMode } from '../types.ts'

const BLANK: Partial<Employee> = {
  name: '', beneficiary_name: '', monthly_pay: 0, tiffin_eligible: false,
  bank_ifsc: '', bank_account_no: '', bank_account_type: 'SB',
  is_director: false, default_pay_mode: 'neft', active: true, sort_order: 99,
}

export default function EmployeesPage() {
  const { employees, saveEmployee } = useStore()
  const [editing, setEditing] = useState<Partial<Employee> | null>(null)

  const active = employees.filter((e) => e.active)
  const inactive = employees.filter((e) => !e.active)

  return (
    <div className="space-y-5">
      <div className="rise rubric">
        <span>Roster</span>
        <span className="tnum normal-case tracking-normal text-ink-4">
          {active.length} on the books · {inactive.length} left
        </span>
        <button className="btn-secondary ml-auto" onClick={() => setEditing({ ...BLANK })}>
          Add employee
        </button>
      </div>

      <div className="rise leaf overflow-x-auto" style={{ animationDelay: '60ms' }}>
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Name</th>
              <th className="th">Beneficiary — as per bank</th>
              <th className="th text-right">Monthly Pay</th>
              <th className="th">Tiffin</th>
              <th className="th">IFSC</th>
              <th className="th">Account</th>
              <th className="th">Mode</th>
              <th className="th text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e, i) => {
              const mismatch = e.beneficiary_name !== e.name
              return (
                <tr
                  key={e.id}
                  onClick={() => setEditing(e)}
                  className={`cursor-pointer transition-colors hover:bg-paper-sunk/60 ${
                    e.active ? '' : 'text-ink-4'
                  }`}
                  style={{ animationDelay: `${80 + i * 20}ms` }}
                >
                  <td className="td font-medium">
                    {e.name}
                    {e.is_director && <span className="tag ml-2 text-ink-3">Director</span>}
                  </td>
                  <td
                    className={`td ${mismatch ? 'text-ochre' : 'text-ink-3'}`}
                    title={mismatch ? 'Differs from the salary-sheet name' : undefined}
                  >
                    {e.beneficiary_name}
                    {mismatch && <span className="ml-1.5 text-[10px]">≠</span>}
                  </td>
                  <td className="td tnum text-right">{inr(e.monthly_pay)}</td>
                  <td className="td font-mono text-[10px] uppercase tracking-[.1em] text-ink-3">
                    {e.tiffin_eligible ? 'Auto' : '—'}
                  </td>
                  <td className="td font-mono text-[11px] text-ink-2">{e.bank_ifsc || '—'}</td>
                  <td className="td tnum text-[11px] text-ink-2">{e.bank_account_no || '—'}</td>
                  <td className="td font-mono text-[10px] uppercase tracking-[.1em] text-ink-3">
                    {e.default_pay_mode === 'excluded' ? 'off run' : e.default_pay_mode}
                  </td>
                  <td className="td text-right">
                    {e.active ? (
                      <span className="tag bg-verdigris-wash text-verdigris">On books</span>
                    ) : (
                      <span className="tag text-ink-4">Left</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-[10px] leading-relaxed text-ink-4">
        Names marked <span className="text-ochre">≠</span> differ between the salary sheet and the
        bank's records. The bank file always carries the beneficiary name.
      </p>

      {editing && (
        <EmployeeDialog
          employee={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await saveEmployee(data)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function EmployeeDialog({
  employee, onClose, onSave,
}: {
  employee: Partial<Employee>
  onClose: () => void
  onSave: (employee: Partial<Employee>) => Promise<void>
}) {
  const [form, setForm] = useState(employee)
  const set = (patch: Partial<Employee>) => setForm((f) => ({ ...f, ...patch }))

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-center bg-ink/30 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="rise leaf w-full max-w-2xl p-6 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rubric mb-5">
          <span>{form.id ? 'Amend record' : 'New record'}</span>
          <button className="btn-ghost ml-auto" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name — salary sheet">
            <input
              className="input"
              value={form.name ?? ''}
              onChange={(e) => set({ name: e.target.value })}
            />
          </Field>
          <Field label="Beneficiary — as per bank">
            <input
              className="input"
              value={form.beneficiary_name ?? ''}
              onChange={(e) => set({ beneficiary_name: e.target.value })}
            />
          </Field>
          <Field label="Monthly pay">
            <input
              className="input tnum"
              type="number"
              value={form.monthly_pay ?? 0}
              onChange={(e) => set({ monthly_pay: Number(e.target.value) })}
            />
          </Field>
          <Field label="Bank IFSC">
            <input
              className="input font-mono uppercase"
              value={form.bank_ifsc ?? ''}
              onChange={(e) => set({ bank_ifsc: e.target.value.toUpperCase() })}
              maxLength={11}
            />
          </Field>
          <Field label="Account number">
            <input
              className="input tnum"
              value={form.bank_account_no ?? ''}
              onChange={(e) => set({ bank_account_no: e.target.value })}
            />
          </Field>
          <Field label="Account type">
            <select
              className="input"
              value={form.bank_account_type ?? 'SB'}
              onChange={(e) => set({ bank_account_type: e.target.value })}
            >
              <option value="SB">SB — Savings</option>
              <option value="CA">CA — Current</option>
            </select>
          </Field>
          <Field label="Default pay mode">
            <select
              className="input"
              value={form.default_pay_mode ?? 'neft'}
              onChange={(e) => set({ default_pay_mode: e.target.value as PayMode })}
            >
              <option value="neft">NEFT — in the bank file</option>
              <option value="cash">Cash — counted, not in the file</option>
              <option value="excluded">Off run — not paid here</option>
            </select>
          </Field>
          <Field label="Phone">
            <input
              className="input tnum"
              value={form.phone ?? ''}
              onChange={(e) => set({ phone: e.target.value })}
            />
          </Field>
          <Field label="Joining date">
            <input
              className="input"
              type="date"
              value={form.join_date ?? ''}
              onChange={(e) => set({ join_date: e.target.value })}
            />
          </Field>
          <Field label="Sort order">
            <input
              className="input tnum"
              type="number"
              value={form.sort_order ?? 99}
              onChange={(e) => set({ sort_order: Number(e.target.value) })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <input
                className="input"
                value={form.notes ?? ''}
                onChange={(e) => set({ notes: e.target.value })}
              />
            </Field>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-rule pt-4 text-[13px]">
          <Toggle
            checked={!!form.tiffin_eligible}
            onChange={(v) => set({ tiffin_eligible: v })}
            label="Tiffin eligible — ₹10 × days present"
          />
          <Toggle
            checked={!!form.is_director}
            onChange={(v) => set({ is_director: v })}
            label="Director"
          />
          <Toggle
            checked={form.active !== false}
            onChange={(v) => set({ active: v })}
            label="On the books"
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => void onSave(form)}>
            Save record
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

function Toggle({
  checked, onChange, label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-vermillion"
      />
      {label}
    </label>
  )
}
