import { describe, it, expect } from "vitest";
import {
  defaultTheme,
  isTheme,
  themes,
  THEME_COOKIE,
  THEME_INIT_SCRIPT,
} from "./theme";

describe("isTheme", () => {
  it("accepts every supported theme", () => {
    for (const theme of themes) {
      expect(isTheme(theme)).toBe(true);
    }
  });

  it("rejects unknown, empty and missing values", () => {
    expect(isTheme("solarized")).toBe(false);
    expect(isTheme("")).toBe(false);
    expect(isTheme(undefined)).toBe(false);
    expect(isTheme(null)).toBe(false);
  });
});

/**
 * Runs THEME_INIT_SCRIPT against a stubbed DOM. The script is a bare IIFE that
 * reads `document` and `window` as free variables, so handing them in as
 * function parameters shadows the real globals and lets us assert on what it
 * would have done to <html>.
 */
function runInitScript({
  cookie,
  prefersDark,
  matchMediaThrows = false,
}: {
  cookie: string;
  prefersDark: boolean;
  matchMediaThrows?: boolean;
}) {
  const classes = new Set<string>();
  const documentStub = {
    cookie,
    documentElement: {
      style: { colorScheme: "" },
      classList: {
        toggle: (name: string, on: boolean) => {
          if (on) classes.add(name);
          else classes.delete(name);
        },
      },
    },
  };
  const windowStub = {
    matchMedia: (query: string) => {
      if (matchMediaThrows) throw new Error("matchMedia unavailable");
      return { matches: query.includes("dark") ? prefersDark : !prefersDark };
    },
  };

  // eslint-disable-next-line no-new-func
  new Function("document", "window", THEME_INIT_SCRIPT)(documentStub, windowStub);

  return {
    isDark: classes.has("dark"),
    colorScheme: documentStub.documentElement.style.colorScheme,
  };
}

describe("THEME_INIT_SCRIPT", () => {
  it("honours an explicit dark cookie regardless of the OS preference", () => {
    expect(
      runInitScript({ cookie: `${THEME_COOKIE}=dark`, prefersDark: false }),
    ).toEqual({ isDark: true, colorScheme: "dark" });
  });

  it("honours an explicit light cookie regardless of the OS preference", () => {
    expect(
      runInitScript({ cookie: `${THEME_COOKIE}=light`, prefersDark: true }),
    ).toEqual({ isDark: false, colorScheme: "light" });
  });

  it("follows the OS preference when the cookie says system", () => {
    expect(
      runInitScript({ cookie: `${THEME_COOKIE}=system`, prefersDark: true }),
    ).toEqual({ isDark: true, colorScheme: "dark" });
    expect(
      runInitScript({ cookie: `${THEME_COOKIE}=system`, prefersDark: false }),
    ).toEqual({ isDark: false, colorScheme: "light" });
  });

  it("falls back to the OS preference when no theme cookie is set", () => {
    expect(defaultTheme).toBe("system");
    expect(runInitScript({ cookie: "", prefersDark: true })).toEqual({
      isDark: true,
      colorScheme: "dark",
    });
  });

  it("ignores an unrecognised cookie value and asks the OS instead", () => {
    expect(
      runInitScript({ cookie: `${THEME_COOKIE}=neon`, prefersDark: false }),
    ).toEqual({ isDark: false, colorScheme: "light" });
  });

  it("reads the theme cookie when other cookies surround it", () => {
    expect(
      runInitScript({
        cookie: `NEXT_LOCALE=es; ${THEME_COOKIE}=light; other=1`,
        prefersDark: true,
      }),
    ).toEqual({ isDark: false, colorScheme: "light" });
  });

  it("does not match a cookie whose name merely ends with the theme name", () => {
    // `my_theme=dark` must not be read as `theme=dark`.
    expect(
      runInitScript({ cookie: `my_${THEME_COOKIE}=dark`, prefersDark: false }),
    ).toEqual({ isDark: false, colorScheme: "light" });
  });

  it("never throws, so a hostile environment cannot block first paint", () => {
    expect(() =>
      runInitScript({
        cookie: `${THEME_COOKIE}=system`,
        prefersDark: true,
        matchMediaThrows: true,
      }),
    ).not.toThrow();
  });
});
