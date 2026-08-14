import type { Metadata } from "next";
import { Newsreader, Source_Sans_3 } from "next/font/google";
import "./globals.css";

// Editorial serif — headings, display labels. Sans — all UI chrome. This is
// a museum-archive tool, not a SaaS dashboard, so the type pairing leans
// editorial rather than corporate. Newsreader carries an optical-size axis,
// so it stays sharp from small captions up through large display headings
// instead of just scaling.
const newsreader = Newsreader({
  variable: "--next-font-display",
  subsets: ["latin"],
  axes: ["opsz"],
});

const sourceSans = Source_Sans_3({
  variable: "--next-font-ui",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TBR Art Board",
  description: "Internal art review tool for The Brooklyn Review",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${newsreader.variable} ${sourceSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
