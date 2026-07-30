/**
 * Theme preference, persisted in a cookie so the server can render the correct
 * `class` on <html> and avoid a flash of the wrong theme.
 *
 * Mirrors the locale plumbing in `src/i18n/config.ts` + `src/app/api/locale/route.ts`.
 */

export const themes = ["system", "light", "dark"] as const;
export type Theme = (typeof themes)[number];

/** The two concrete appearances a `Theme` can resolve to. */
export type ResolvedTheme = "light" | "dark";

export const defaultTheme: Theme = "system";

export const THEME_COOKIE = "theme";

export function isTheme(value: string | undefined | null): value is Theme {
  return !!value && (themes as readonly string[]).includes(value);
}

/**
 * Applies the resolved theme to <html>: the `dark` class drives every Tailwind
 * `dark:` variant and the `.dark` token block in globals.css, while
 * `color-scheme` makes native widgets (scrollbars, date pickers, autofill)
 * follow along.
 */
export function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

/**
 * Runs before first paint, inlined in <head>. The server cannot know the OS
 * preference, so when the stored theme is "system" this resolves it client-side
 * and fixes up the class the server guessed. Kept dependency-free and defensive:
 * if anything throws we leave the server-rendered class alone.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);var t=m?decodeURIComponent(m[1]):"${defaultTheme}";if(t!=="light"&&t!=="dark")t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";var r=document.documentElement;r.classList.toggle("dark",t==="dark");r.style.colorScheme=t;}catch(e){}})();`;
