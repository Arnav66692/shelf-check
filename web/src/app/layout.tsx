import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

const TEXT_SIZE_SCRIPT =
  'try{if(localStorage.getItem("shelf-check.text-size")==="large")document.documentElement.dataset.text="large"}catch(e){}';

export const metadata: Metadata = {
  title: "Shelf Check",
  description: "Check every medicine you own against its official label. Double doses, interactions and unit mix-ups, each quoted from the label.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEXT_SIZE_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:bg-[var(--panel)] focus:px-3 focus:py-2 focus:font-bold"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" tabIndex={-1} className="flex-1 w-full max-w-[1180px] mx-auto px-4 sm:px-8 pb-24 focus:outline-none">
          {children}
        </main>
        <footer className="w-full max-w-[1180px] mx-auto px-4 sm:px-8 py-6 text-sm text-ink-soft thick">
          <div>
            <Link href="/tested" className="underline font-bold text-ink">
              How we tested it
            </Link>
          </div>
          <p className="mt-2">
            A safety check, not medical advice. Every flag quotes an official label. Show it to your pharmacist or
            doctor before you change what you take.
          </p>
          <p className="mt-2 text-ink font-bold">
            Possible poisoning or overdose in the United States: Poison Help, 1-800-222-1222. Collapse, seizure or
            trouble breathing: call 911.
          </p>
        </footer>
      </body>
    </html>
  );
}
