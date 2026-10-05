import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Card Scanner",
  description: "Your private card workspace.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full font-sans antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
