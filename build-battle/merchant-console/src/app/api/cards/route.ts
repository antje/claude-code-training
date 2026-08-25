import {
  cardByIdempotencyKey,
  issueCard,
  listCards,
  parseIssueRequest,
} from "@/data/cards"
import { NextRequest, NextResponse } from "next/server"

/**
 * GET  — every issued card. Records carry `last4` only; there is no field for a
 *        full number, so this cannot leak one.
 * POST — issue. The full number appears here and nowhere else, ever.
 */

export function GET() {
  return NextResponse.json({ cards: listCards() })
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { message: "Expected a JSON body." },
      { status: 400 },
    )
  }

  const parsed = parseIssueRequest(body)
  if (!parsed.ok) {
    return NextResponse.json(
      { message: "Check the highlighted fields.", errors: parsed.errors },
      { status: 400 },
    )
  }

  // A retry must not mint a second card — ops clicking twice on a slow
  // connection is how the wrong-limit incident started.
  const idempotencyKey = request.headers.get("idempotency-key") ?? undefined
  if (idempotencyKey) {
    const existing = cardByIdempotencyKey(idempotencyKey)
    if (existing) {
      // 200, not 201 — nothing was created, and the number is not replayed.
      return NextResponse.json(
        { card: existing, alreadyIssued: true },
        { status: 200 },
      )
    }
  }

  const { card, fullNumber } = issueCard(parsed.value, new Date(), idempotencyKey)

  // The one and only time the full number is returned. Reveal once, mask forever.
  return NextResponse.json({ card, fullNumber }, { status: 201 })
}
