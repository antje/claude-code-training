import { merchantById } from "@/data/merchants"
import { Payment } from "@/data/types"
import { formatMoney } from "./money"

/**
 * CSV export for the payments table.
 *
 * Ops chooses the columns and the scope (NWP-101). The column set that
 * arrives from the client is validated here against EXPORT_COLUMNS before it
 * reaches a cell or a filename — the same allowlist discipline the query
 * builder applies to filters.
 */

export const EXPORT_COLUMNS = [
  "id",
  "created_at",
  "merchant",
  "description",
  "status",
  "method",
  "card_brand",
  "last4",
  "amount",
  "currency",
] as const

export type ExportColumn = (typeof EXPORT_COLUMNS)[number]

/**
 * What ops gets when they do not choose. Every column except the card last
 * four, which stays off until someone asks for it: a file that leaves the
 * building should not carry it by accident.
 */
export const DEFAULT_EXPORT_COLUMNS: readonly ExportColumn[] =
  EXPORT_COLUMNS.filter((column) => column !== "last4")

/** Scope of an export: the table's current filters, or every payment. */
export const EXPORT_SCOPES = ["filtered", "all"] as const

export type ExportScope = (typeof EXPORT_SCOPES)[number]

export function parseScope(value: string | null): ExportScope {
  return EXPORT_SCOPES.includes(value as ExportScope)
    ? (value as ExportScope)
    : "filtered"
}

/**
 * Turn the client's `columns` parameter into a column set we are willing to
 * serialize. Unknown names are dropped rather than escaped, duplicates
 * collapse, and the caller's order is preserved.
 *
 * Returns an empty array when nothing valid was asked for. Callers reject
 * that; they do not silently fall back to the default, because an ops user
 * who unticked everything did not mean "give me everything".
 */
export function parseColumns(value: string | null): ExportColumn[] {
  if (value === null) return [...DEFAULT_EXPORT_COLUMNS]

  const seen = new Set<ExportColumn>()
  for (const raw of value.split(",")) {
    const name = raw.trim()
    if (EXPORT_COLUMNS.includes(name as ExportColumn)) {
      seen.add(name as ExportColumn)
    }
  }
  return [...seen]
}

function escapeCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function cell(payment: Payment, column: ExportColumn): string {
  switch (column) {
    case "id":
      return payment.id
    case "created_at":
      return payment.createdAt
    case "merchant":
      return merchantById(payment.merchantId)?.name ?? payment.merchantId
    case "description":
      return payment.description
    case "status":
      return payment.status
    case "method":
      return payment.method
    case "card_brand":
      return payment.cardBrand ?? ""
    case "last4":
      return payment.last4 ?? ""
    case "amount":
      return formatMoney(payment.amount, payment.currency)
    case "currency":
      return payment.currency
  }
}

export function toCsv(
  payments: Payment[],
  columns: readonly ExportColumn[] = EXPORT_COLUMNS,
): string {
  const header = columns.join(",")
  const rows = payments.map((payment) =>
    columns.map((column) => escapeCell(cell(payment, column))).join(","),
  )
  return [header, ...rows].join("\n")
}

/**
 * `payments-disputed-2026-08-13.csv`. The scope segment is a slug ops chose
 * from an allowlist upstream, never raw client text, and the date is the UTC
 * day — storage and bucketing are UTC, and a filename is a bucket.
 */
export function exportFilename(date = new Date(), scope?: string): string {
  const day = date.toISOString().slice(0, 10)
  const slug = scope?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  return slug ? `payments-${slug}-${day}.csv` : `payments-${day}.csv`
}
