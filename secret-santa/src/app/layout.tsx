import type { Metadata, Viewport } from "next";
import { Mountains_of_Christmas, Nunito } from "next/font/google";
import type { ReactNode } from "react";
import { Snowfall } from "@/components/Snowfall";
import "./globals.css";

const christmas = Mountains_of_Christmas({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-christmas", adjustFontFallback: false });
const body = Nunito({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Secret Santa",
  description: "Draw names, share wishlists and keep the surprise.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0f4c75" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${christmas.variable} ${body.variable}`}>
      <body>
        <Snowfall />
        {children}
      </body>
    </html>
  );
}
