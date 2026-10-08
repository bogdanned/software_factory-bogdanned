import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/header";
import { Providers } from "@/components/providers";
import "./globals.css";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = { title: "Pulse" };

// Applies the saved colour preset before the first paint.
const presetScript = `try{var t=localStorage.getItem("pulse-preset");if(t&&t!=="neutral")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: presetScript }} />
      </head>
      <body className={`${sans.variable} ${mono.variable} font-sans antialiased`}>
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-3xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
