import type { Metadata, Viewport } from "next";
import { Geist_Mono, Manrope } from "next/font/google";

import "./globals.css";
import { Providers } from "./providers";

/** Circle Web SDK requires client-side initialization — skip static prerendering */
export const dynamic = "force-dynamic";

const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WizPay — Cross-Token Payroll on Arc",
  description:
    "Live WizPay payroll dashboard for Arc Testnet with dark-mode batch routing, real-time balance tracking, and mixed USDC or EURC recipient settlement.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#1a1130",
};

import { Toaster } from "@/components/ui/toaster";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col overscroll-none">
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
