import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { Instrument_Sans, Manrope } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { TenantProvider } from "@/components/tenant/TenantProvider";
import { defaultTheme, isTheme, THEME_COOKIE, THEME_INIT_SCRIPT } from "@/lib/theme";
import {
  fetchTenantConfig,
  tenantPaletteCss,
  TENANT_HOST_HEADER,
  type TenantConfig,
} from "@/lib/tenant-config";
import { deriveTenantPalette } from "@/lib/tenant-palette";
import "@/styles/globals.css";
import { Providers } from "./providers";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

/**
 * The tenant for this request.
 *
 * `x-tenant-host` is the normalized host `src/middleware.ts` already resolved
 * against; the raw headers are the fallback for a path the matcher skips.
 * `fetchTenantConfig` caches per host, so `generateMetadata` and the render
 * below share one lookup.
 */
async function resolveTenant(): Promise<TenantConfig> {
  const requestHeaders = headers();
  return fetchTenantConfig(
    requestHeaders.get(TENANT_HOST_HEADER) ??
      requestHeaders.get("x-forwarded-host") ??
      requestHeaders.get("host")
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await resolveTenant();

  return {
    title: tenant.brand.title,
    description: tenant.brand.description,
    // There is no `app/favicon.ico` convention in this repo, so the per-tenant
    // icon has to come through here.
    icons: tenant.faviconUrl ? { icon: tenant.faviconUrl } : undefined,
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  const tenant = await resolveTenant();

  // The server cannot read the OS preference, so "system" is rendered as dark
  // and corrected by THEME_INIT_SCRIPT before the first paint.
  const cookieTheme = cookies().get(THEME_COOKIE)?.value;
  const theme = isTheme(cookieTheme) ? cookieTheme : defaultTheme;
  const resolvedTheme = theme === "light" ? "light" : "dark";

  // Same move THEME_INIT_SCRIPT makes for dark mode: decide on the server, emit
  // it in <head>, and there is no flash of our gold to correct afterwards.
  //
  // Only a tenant who actually set an accent gets an override. Re-deriving the
  // house gold would land near the `globals.css` literals but not exactly on
  // them, and D2C is tenant #1 — its appearance must not drift as a side effect.
  const palette = tenant.accentHex ? deriveTenantPalette(tenant.accentHex) : null;
  const paletteCss = palette
    ? tenantPaletteCss(palette.variables.light, palette.variables.dark)
    : null;

  return (
    <html
      lang={locale}
      className={resolvedTheme === "dark" ? "dark" : undefined}
      style={{ colorScheme: resolvedTheme }}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {paletteCss && <style dangerouslySetInnerHTML={{ __html: paletteCss }} />}
      </head>
      <body
        className={`${instrumentSans.variable} ${manrope.variable} font-sans`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TenantProvider config={tenant}>
            <ThemeProvider
              initialTheme={theme}
              initialResolvedTheme={resolvedTheme}
            >
              <Providers>{children}</Providers>
            </ThemeProvider>
          </TenantProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
