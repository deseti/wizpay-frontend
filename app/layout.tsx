import type { Metadata } from "next";
import { Geist_Mono, Manrope } from "next/font/google";

import "@rainbow-me/rainbowkit/styles.css";

import "./globals.css";
import { Providers } from "./providers";

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
  title: "WizPay - Live Payroll Routing on Arc",
  description:
    "Live WizPay payroll dashboard for Arc Testnet with dark-mode batch routing, real-time balance tracking, and mixed USDC or EURC recipient settlement.",
};

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
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
