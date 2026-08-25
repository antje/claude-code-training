import { cardById, setCardStatus } from "@/data/cards"
import { CARD_STATUSES } from "@/lib/cards"
import { CardStatus } from "@/data/types"
import { NextRequest, NextResponse } from "next/server"

/**
 * A single card.
 *
 * GET   — the stored record. `last4` only; the full number is not here.
 * PATCH — a status change, with the state machine guarded server-side. The UI
 *         hides illegal buttons, but this is the enforcement.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const card = cardById(id)
  if (!card) {
    return NextResponse.json({ message: "No such card." }, { status: 404 })
  }
  return NextResponse.json({ card })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { message: "Expected a JSON body." },
      { status: 400 },
    )
  }

  const status = (body as { status?: unknown })?.status
  if (!CARD_STATUSES.includes(status as CardStatus)) {
    return NextResponse.json(
      { message: "Status must be active, frozen or cancelled." },
      { status: 400 },
    )
  }

  const result = setCardStatus(id, status as CardStatus)
  if (!result.ok) {
    // 404 for a card that is not there; 409 for a transition the machine forbids.
    return NextResponse.json(
      { message: result.message },
      { status: result.reason === "not_found" ? 404 : 409 },
    )
  }

  return NextResponse.json({ card: result.card })
}
