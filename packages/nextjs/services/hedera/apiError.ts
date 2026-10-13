import { NextResponse } from "next/server";

/** Turns a thrown error into a JSON 400 response, without ever including a stack trace or key material. */
export function errorResponse(e: unknown) {
  const message = e instanceof Error ? e.message : "Unexpected error";
  console.error("[api/hedera/dvp]", e);
  return NextResponse.json({ error: message }, { status: 400 });
}
