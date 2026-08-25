"use client"

import { Button } from "@/components/Button"
import { Checkbox } from "@/components/Checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/Dialog"
import {
  DEFAULT_EXPORT_COLUMNS,
  EXPORT_COLUMNS,
  ExportColumn,
  ExportScope,
} from "@/lib/csv"
import { Download } from "lucide-react"
import { useState } from "react"

/**
 * Export options for the payments table (NWP-101).
 *
 * The download stays a plain link to GET /api/payments/export. The rows are
 * assembled on the server, where the whole filtered set lives — the table
 * here is paginated, so anything built from what is on screen would export
 * one page and call it the file.
 */

const COLUMN_LABELS: Record<ExportColumn, string> = {
  id: "Payment ID",
  created_at: "Created (UTC)",
  merchant: "Merchant",
  description: "Description",
  status: "Status",
  method: "Method",
  card_brand: "Card brand",
  last4: "Card last four",
  amount: "Amount",
  currency: "Currency",
}

/** Columns that carry cardholder detail, called out so nobody ships one by accident. */
const SENSITIVE_COLUMNS: readonly ExportColumn[] = ["last4"]

export function ExportDialog({
  query,
  filteredCount,
  totalCount,
  filterSummary,
}: {
  /** The table's current filters, as a query string. */
  query: string
  /** Rows the current filter matches. */
  filteredCount: number
  /** Rows in the table with no filter at all. */
  totalCount: number
  /** Human-readable description of the current filter, for the scope label. */
  filterSummary: string
}) {
  const [selected, setSelected] = useState<ExportColumn[]>([
    ...DEFAULT_EXPORT_COLUMNS,
  ])
  const [scope, setScope] = useState<ExportScope>("filtered")

  const toggle = (column: ExportColumn) =>
    setSelected((current) =>
      current.includes(column)
        ? current.filter((c) => c !== column)
        : // Keep the file in the table's column order, whatever order they were ticked in.
          EXPORT_COLUMNS.filter((c) => c === column || current.includes(c)),
    )

  const rowCount = scope === "all" ? totalCount : filteredCount
  const empty = selected.length === 0

  const href = () => {
    const params = new URLSearchParams(scope === "all" ? "" : query)
    params.delete("page")
    params.set("scope", scope)
    params.set("columns", selected.join(","))
    return `/api/payments/export?${params.toString()}`
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" className="w-full gap-2 py-1.5 sm:w-fit">
          <Download
            className="-ml-0.5 size-4 shrink-0 text-gray-400 dark:text-gray-600"
            aria-hidden="true"
          />
          Export
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export payments</DialogTitle>
          <DialogDescription className="text-sm">
            Choose what goes in the file before you download it.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-gray-900 dark:text-gray-50">
            Scope
          </legend>
          <div className="mt-2 flex flex-col gap-2">
            <label className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="radio"
                name="export-scope"
                value="filtered"
                checked={scope === "filtered"}
                onChange={() => setScope("filtered")}
                className="size-4 cursor-pointer accent-blue-500"
              />
              <span>
                Current filter{" "}
                <span className="text-gray-500">
                  ({filterSummary}) · {filteredCount.toLocaleString()}{" "}
                  {filteredCount === 1 ? "row" : "rows"}
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="radio"
                name="export-scope"
                value="all"
                checked={scope === "all"}
                onChange={() => setScope("all")}
                className="size-4 cursor-pointer accent-blue-500"
              />
              <span>
                All payments{" "}
                <span className="text-gray-500">
                  · {totalCount.toLocaleString()} rows
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="text-sm font-medium text-gray-900 dark:text-gray-50">
            Columns
          </legend>
          <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {EXPORT_COLUMNS.map((column) => (
              <label
                key={column}
                htmlFor={`export-column-${column}`}
                className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300"
              >
                <Checkbox
                  id={`export-column-${column}`}
                  name="columns"
                  value={column}
                  checked={selected.includes(column)}
                  onChange={() => toggle(column)}
                />
                <span>
                  {COLUMN_LABELS[column]}
                  {SENSITIVE_COLUMNS.includes(column) && (
                    <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-500">
                      sensitive
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <p
          className="mt-4 text-sm text-gray-500 dark:text-gray-500"
          aria-live="polite"
        >
          {empty ? (
            <span className="text-red-600 dark:text-red-500">
              Select at least one column to download a file.
            </span>
          ) : (
            <>
              {rowCount.toLocaleString()} {rowCount === 1 ? "row" : "rows"} ·{" "}
              {selected.length} of {EXPORT_COLUMNS.length} columns
            </>
          )}
        </p>

        <DialogFooter className="mt-6">
          <DialogClose asChild>
            <Button variant="secondary" className="py-1.5">
              Cancel
            </Button>
          </DialogClose>
          {empty ? (
            <Button className="gap-2 py-1.5" disabled>
              <Download className="-ml-0.5 size-4 shrink-0" aria-hidden="true" />
              Download
            </Button>
          ) : (
            <DialogClose asChild>
              <Button className="gap-2 py-1.5" asChild>
                <a href={href()} download>
                  <Download
                    className="-ml-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  Download
                </a>
              </Button>
            </DialogClose>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
