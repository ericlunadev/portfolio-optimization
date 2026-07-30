import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isTheme, THEME_COOKIE } from "@/lib/theme";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { theme?: string }
    | null;
  const theme = body?.theme;

  if (!isTheme(theme)) {
    return NextResponse.json({ error: "invalid theme" }, { status: 400 });
  }

  cookies().set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  return NextResponse.json({ theme });
}
