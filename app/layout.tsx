import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TextBridge",
  description: "Send text and files between your devices instantly.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
