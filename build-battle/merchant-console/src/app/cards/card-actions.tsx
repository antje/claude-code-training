"use client"

import { Button } from "@/components/Button"
import { CardStatus } from "@/data/types"
import { Snowflake, Sun, TriangleAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

/**
 * Freeze and unfreeze a card in place.
 *
 * `router.refresh()` re-renders the server component with fresh data without a
 * full page reload, so the row updates where it stands. The server still guards
 * the transition — this only decides which button to show.
 */
export function CardActions({
  id,
  status,
  compact = false,
}: {
  id: string
  status: CardStatus
  compact?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cancelled is terminal, so there is nothing to offer.
  if (status === "cancelled") {
    return compact ? null : (
      <span className="text-sm text-gray-500">No actions — cancelled</span>
    )
  }

  const next: CardStatus = status === "active" ? "frozen" : "active"

  const move = async () => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/cards/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        setError(payload.message ?? "Could not update the card.")
        return
      }
      startTransition(() => router.refresh())
    } catch {
      setError("Could not reach the server.")
    } finally {
      setBusy(false)
    }
  }

  const label = next === "frozen" ? "Freeze" : "Unfreeze"
  const Icon = next === "frozen" ? Snowflake : Sun

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        className="gap-1.5 py-1"
        onClick={move}
        disabled={busy || pending}
        aria-label={`${label} card ${id}`}
      >
        <Icon className="-ml-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {busy || pending ? "Working…" : label}
      </Button>
      {error && (
        <span
          className="flex items-center gap-1 text-xs text-red-600 dark:text-red-500"
          role="alert"
        >
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </span>
      )}
    </div>
  )
}
