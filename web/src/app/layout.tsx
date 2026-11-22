import type { Metadata } from "next";
import { Courier_Prime, Space_Mono } from "next/font/google";
import localFont from "next/font/local";
import { BottomBar } from "@/components/BottomBar";
import { ParticleField } from "@/components/ParticleField";
import { SiteFooter } from "@/components/SiteFooter";
import { PersonSwitcher } from "@/components/PersonSwitcher";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const general = localFont({
  variable: "--font-general",
  src: [
    { path: "../fonts/GeneralSans-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/GeneralSans-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/GeneralSans-600.woff2", weight: "600", style: "normal" },
  ],
});

const space = Space_Mono({ variable: "--font-space", subsets: ["latin"], weight: ["400", "700"] });
const courier = Courier_Prime({ variable: "--font-courier", subsets: ["latin"], weight: "400" });

const TEXT_SIZE_SCRIPT =
  'try{if(localStorage.getItem("shelf-check.text-size")==="large")document.documentElement.dataset.text="large"}catch(e){}';

export const metadata: Metadata = {
  title: "Shelf Check",
  description: "Check every medicine you own against its official label. Double doses and label warnings, each quoted from the label.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${general.variable} ${space.variable} ${courier.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEXT_SIZE_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ParticleField />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-[var(--paper)] focus:px-3 focus:py-2 focus:border focus:border-dashed focus:border-[var(--rule)]"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" tabIndex={-1} className="flex-1 w-full px-[var(--margin)] pb-28 focus:outline-none">
          <div className="pt-[calc(var(--margin)+92px)] sm:pt-[calc(var(--margin)+52px)] print:pt-0">
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
