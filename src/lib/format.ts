/** Indian-format currency and number helpers. */

export function inr(amount: number, opts: { paise?: boolean } = {}): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: opts.paise ? 2 : 0,
    maximumFractionDigits: opts.paise ? 2 : 0,
  }).format(amount)
}

export function rupees(amount: number, opts: { paise?: boolean } = {}): string {
  return `₹${inr(amount, opts)}`
}

/** dd.mm.yy, the format used on the existing bank letters. */
export function letterDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y.slice(2)}`
}

/** dd/mm/yyyy, the Value_Date format the HDFC bulk file expects. */
export function neftDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function todayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`
}

/** "One Lakh Ten Thousand Seven Hundred Eighty Five Only" for payslips. */
export function amountInWords(amount: number): string {
  const n = Math.round(amount)
  if (n === 0) return 'Zero Only'

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen',
  ]
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  const twoDigit = (v: number): string => {
    if (v < 20) return ones[v]
    const t = tens[Math.floor(v / 10)]
    const o = ones[v % 10]
    return o ? `${t} ${o}` : t
  }

  const threeDigit = (v: number): string => {
    const h = Math.floor(v / 100)
    const rest = v % 100
    const parts: string[] = []
    if (h) parts.push(`${ones[h]} Hundred`)
    if (rest) parts.push(twoDigit(rest))
    return parts.join(' ')
  }

  const parts: string[] = []
  const crore = Math.floor(n / 10000000)
  const lakh = Math.floor((n % 10000000) / 100000)
  const thousand = Math.floor((n % 100000) / 1000)
  const rest = n % 1000

  if (crore) parts.push(`${threeDigit(crore)} Crore`)
  if (lakh) parts.push(`${threeDigit(lakh)} Lakh`)
  if (thousand) parts.push(`${threeDigit(thousand)} Thousand`)
  if (rest) parts.push(threeDigit(rest))

  return `${parts.join(' ')} Only`
}
