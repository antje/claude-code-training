import { filterPayments, parseFilters, sortPayments } from "@/data/queries"
import {
  ExportScope,
  exportFilename,
  parseColumns,
  parseScope,
  toCsv,
} from "@/lib/csv"
import { NextRequest, NextResponse } from "next/server"

/**
 * Exports the payments table as CSV (NWP-101).
 *
 * Ops picks the columns and the scope. Both arrive from the client, so both
 * are checked against an allowlist here before they reach the query builder,
 * a cell, or the filename. Scope `all` is expressed as an empty filter set
 * rather than a second read of the store, so there is still exactly one
 * payment query builder.
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const filters = parseFilters(params)
  const scope: ExportScope = parseScope(params.get("scope"))
  const columns = parseColumns(params.get("columns"))

  if (columns.length === 0) {
    return NextResponse.json(
      { message: "Choose at least one column to export." },
      { status: 400 },
    )
  }

  const rows = sortPayments(
    filterPayments(scope === "all" ? {} : filters),
    filters.sort,
    filters.direction,
  )

  return new Response(toCsv(rows, columns), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFilename(
        new Date(),
        exportScopeSlug(scope, filters.status),
      )}"`,
    },
  })
}

/**
 * The scope segment of the filename. `all` says so; a filtered export names
 * the status it was filtered to, which is the filter ops recognises on disk.
 * Both come from allowlists, never from raw client text.
 */
function exportScopeSlug(
  scope: ExportScope,
  status: ReturnType<typeof parseFilters>["status"],
): string | undefined {
  if (scope === "all") return "all"
  return status && status !== "all" ? status : undefined
}
