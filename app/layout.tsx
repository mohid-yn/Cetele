import type { Metadata, Viewport } from "next";
import { Geist, Quicksand } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "./sw-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Rounded, friendly display face — echoes the Youth Nexus wordmark.
const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Cetele — group dhikr tracker",
  description:
    "Track your daily dhikr together. A shared tally that makes remembrance a habit.",
  applicationName: "Cetele",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Cetele",
  },
};

export const viewport: Viewport = {
  themeColor: "#1d3a5f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${quicksand.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
