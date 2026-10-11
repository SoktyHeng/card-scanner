import type { Metadata } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import { LANGUAGE_COOKIE, parseLanguage } from "@/lib/i18n/locale";
import { LanguageProvider, LanguageSelector } from "@/components/i18n/language-provider";

export const metadata: Metadata = {
  title: "Card Scanner",
  description: "Your private card workspace.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const language = parseLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value);
  return (
    <html lang={language} className="h-full font-sans antialiased">
      <body className="min-h-full"><LanguageProvider initialLanguage={language}><div className="mx-auto flex max-w-6xl justify-end px-4 py-2 sm:px-8"><LanguageSelector /></div>{children}</LanguageProvider></body>
    </html>
  );
}
