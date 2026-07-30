import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Franch Realty — Internal Platform",
  description:
    "Inventory & client-matching platform for Franch Realty (Hyderabad & Chennai).",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
