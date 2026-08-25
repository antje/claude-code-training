"use client"

import { Button } from "@/components/Button"
import { CardStatus } from "@/data/types"
import { Ban, Snowflake, Sun, TriangleAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

/**
 * Freeze, unfreeze and cancel in place: `router.refresh()` re-renders the
 * server component without a full reload. The server still guards every
 * transition; this only decides which buttons show. Cancel asks first, because
 * `cancelled` is terminal.
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
  const [confirming, setConfirming] = useState(false)

  // Terminal: nothing to offer.
  if (status === "cancelled") {
    return compact ? null : (
      <span className="text-sm text-gray-500">No actions — cancelled</span>
    )
  }

  const working = busy || pending

  const move = async (to: CardStatus) => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/cards/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: to }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        setError(payload.message ?? "Could not update the card.")
        return
      }
      setConfirming(false)
      startTransition(() => router.refresh())
    } catch {
      setError("Could not reach the server.")
    } finally {
      setBusy(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-900 dark:text-gray-50">
          Cancel permanently?
        </span>
        <Button
          variant="destructive"
          className="py-1"
          onClick={() => move("cancelled")}
          disabled={working}
        >
          {working ? "Cancelling…" : "Yes, cancel"}
        </Button>
        <Button
          variant="secondary"
          className="py-1"
          onClick={() => setConfirming(false)}
          disabled={working}
        >
          Keep
        </Button>
      </div>
    )
  }

  const thaw = status === "frozen"
  const Icon = thaw ? Sun : Snowflake

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        className="gap-1.5 py-1"
        onClick={() => move(thaw ? "active" : "frozen")}
        disabled={working}
        aria-label={`${thaw ? "Unfreeze" : "Freeze"} card ${id}`}
      >
        <Icon className="-ml-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {working ? "Working…" : thaw ? "Unfreeze" : "Freeze"}
      </Button>
      <Button
        variant="secondary"
        className="gap-1.5 py-1"
        onClick={() => setConfirming(true)}
        disabled={working}
        aria-label={`Cancel card ${id}`}
      >
        <Ban className="-ml-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Cancel
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
