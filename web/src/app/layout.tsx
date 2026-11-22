import type { Metadata } from "next";
import { Azeret_Mono } from "next/font/google";
import { BackToTop } from "@/components/BackToTop";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const azeret = Azeret_Mono({
  variable: "--font-azeret",
  subsets: ["latin"],
  weight: "variable",
  style: ["normal", "italic"],
});

const TEXT_SIZE_SCRIPT =
  'try{if(localStorage.getItem("shelf-check.text-size")==="large")document.documentElement.dataset.text="large"}catch(e){}';

export const metadata: Metadata = {
  title: "Shelf Check",
  description: "Check every medicine you own against its official label. Double doses and label warnings, each quoted from the label.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${azeret.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEXT_SIZE_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-[var(--paper)] focus:px-3 focus:py-2 focus:border focus:border-[var(--rule)]"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" tabIndex={-1} className="flex-1 w-full px-[var(--space-1)] pb-24 focus:outline-none">
          {children}
        </main>
        <SiteFooter />
        <BackToTop />
      </body>
    </html>
  );
}
