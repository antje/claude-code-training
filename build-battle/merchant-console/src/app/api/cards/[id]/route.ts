import { cardById, setCardStatus } from "@/data/cards"
import { CARD_STATUSES } from "@/lib/cards"
import { CardStatus } from "@/data/types"
import { NextRequest, NextResponse } from "next/server"

/**
 * GET   — the stored record, `last4` only.
 * PATCH — a status change, with the machine guarded server-side.
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
    // 404 if absent; 409 if the machine forbids the move.
    return NextResponse.json(
      { message: result.message },
      { status: result.reason === "not_found" ? 404 : 409 },
    )
  }

  return NextResponse.json({ card: result.card })
}
