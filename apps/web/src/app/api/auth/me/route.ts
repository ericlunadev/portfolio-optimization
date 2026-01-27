import { NextResponse } from "next/server";

// Simplified auth endpoint - returns null user for now
export async function GET() {
  return NextResponse.json(null, { status: 401 });
}
