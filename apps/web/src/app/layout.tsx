import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Instrument_Serif, Manrope } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { defaultTheme, isTheme, THEME_COOKIE, THEME_INIT_SCRIPT } from "@/lib/theme";
import "@/styles/globals.css";
import { Providers } from "./providers";

const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return {
    title: t("title"),
    description: t("description"),
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

  // The server cannot read the OS preference, so "system" is rendered as dark
  // and corrected by THEME_INIT_SCRIPT before the first paint.
  const cookieTheme = cookies().get(THEME_COOKIE)?.value;
  const theme = isTheme(cookieTheme) ? cookieTheme : defaultTheme;
  const resolvedTheme = theme === "light" ? "light" : "dark";

  return (
    <html
      lang={locale}
      className={resolvedTheme === "dark" ? "dark" : undefined}
      style={{ colorScheme: resolvedTheme }}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className={`${instrumentSerif.variable} ${manrope.variable} font-sans`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider
            initialTheme={theme}
            initialResolvedTheme={resolvedTheme}
          >
            <Providers>{children}</Providers>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
