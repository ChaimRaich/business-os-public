import type { Metadata, Viewport } from "next";
import { Geist_Mono, Rubik, Space_Grotesk } from "next/font/google";
import { RevealObserver, ScrollFx } from "@/components/motion";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Body text, Hebrew and Latin alike. Geist Mono is kept for codes only (font-mono).
const hebrewSans = Rubik({
  variable: "--font-hebrew",
  subsets: ["hebrew", "latin"],
});

// The "Business OS" wordmark only.
const wordmarkGrotesk = Space_Grotesk({
  variable: "--font-wordmark-grotesk",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: { default: "Business OS", template: "%s · Business OS" },
  description: "ניהול עסק קטן ובינוני במקום אחד: מלאי, קמפיינים וראיית חשבון",
};

export const viewport: Viewport = {
  themeColor: "#121212",
};

// Runs before first paint: applies the saved theme and marks that scripts are available,
// so scroll-reveal content is only ever hidden when something can reveal it.
const bootScript = `(function(){var d=document.documentElement;try{var t=localStorage.getItem("theme");d.dataset.theme=t==="light"?"light":"dark"}catch(e){d.dataset.theme="dark"}d.classList.add("js")})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="he"
      dir="rtl"
      // Smooth scrolling is for in-page links; Next turns it off while it moves between screens.
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${geistMono.variable} ${hebrewSans.variable} ${wordmarkGrotesk.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
        {children}
        <RevealObserver />
        <ScrollFx />
        <ServiceWorker />
      </body>
    </html>
  );
}
