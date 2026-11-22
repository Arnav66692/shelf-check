import { Suspense } from "react";
import type { Metadata } from "next";
import { Nunito_Sans, Saira } from "next/font/google";
import { BottomBar } from "@/components/BottomBar";
import { StarField } from "@/components/StarField";
import { SiteFooter } from "@/components/SiteFooter";
import { PersonSwitcher } from "@/components/PersonSwitcher";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const body = Nunito_Sans({ variable: "--font-body", subsets: ["latin"], weight: ["300", "400", "600"] });
const display = Saira({ variable: "--font-display", subsets: ["latin"], weight: ["200", "500"] });

const TEXT_SIZE_SCRIPT =
  'try{if(localStorage.getItem("shelf-check.text-size")==="large")document.documentElement.dataset.text="large"}catch(e){}';

export const metadata: Metadata = {
  title: "Shelf Check",
  description: "Check every medicine you own against its official label. Double doses and label warnings, each quoted from the label.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEXT_SIZE_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <StarField />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-[var(--paper)] focus:px-3 focus:py-2 focus:border focus:border-solid focus:border-[var(--rule)]"
        >
          Skip to content
        </a>
        <Suspense>
          <SiteHeader />
        </Suspense>
        <main id="main" tabIndex={-1} className="flex-1 w-full px-[var(--margin)] pb-28 focus:outline-none">
          <div data-skip-read className="pt-[calc(var(--margin)+92px)] sm:pt-[calc(var(--margin)+52px)] print:hidden">
            <PersonSwitcher />
          </div>
          {children}
        </main>
        <SiteFooter />
        <BottomBar />
      </body>
    </html>
  );
}
