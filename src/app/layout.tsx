import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { NO_FLASH_THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Excavator Manager",
  description: "Smart excavator & fleet management.",
};

// viewportFit: "cover" lets the page draw under notches/rounded corners and
// unlocks env(safe-area-inset-*) — without it those all resolve to 0 and
// fixed bottom bars/sheets would sit flush behind the home-indicator area.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
