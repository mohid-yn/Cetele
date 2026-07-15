import type { Metadata, Viewport } from "next";
import { Geist, Quicksand } from "next/font/google";
import "./globals.css";
import { BRAND_THEME_COLOR } from "@/lib/brand";
import { ServiceWorkerRegister } from "./sw-register";
import {
  ThemeProvider,
  THEME_NO_FLASH_SCRIPT,
} from "@/components/theme/theme-provider";
import { MotionProvider } from "@/components/motion/motion-provider";

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
  // Static assets under /public referenced directly — NOT the app/icon file
  // convention, whose ICO/PNG image processing rejected the generated marks.
  // logo.svg is the crisp modern favicon; the 192 PNG is the raster fallback.
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/apple-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Cetele",
  },
};

export const viewport: Viewport = {
  themeColor: BRAND_THEME_COLOR,
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
      suppressHydrationWarning
      className={`${geistSans.variable} ${quicksand.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <script dangerouslySetInnerHTML={{ __html: THEME_NO_FLASH_SCRIPT }} />
        <ThemeProvider>
          <MotionProvider>
            {children}
            <ServiceWorkerRegister />
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
