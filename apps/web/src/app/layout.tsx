import type { Metadata } from "next";
import { Instrument_Serif, Manrope } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Optimización de Portafolio",
  description: "Herramienta de optimización de portafolio Markowitz",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body
        className={`${instrumentSerif.variable} ${manrope.variable} font-sans`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
