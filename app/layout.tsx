import type { Metadata } from "next";
import { Zen_Maru_Gothic } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const zenMaruGothic = Zen_Maru_Gothic({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-zen-maru",
});

export const metadata: Metadata = {
  title: "Ianthe's Lullaby",
  description: "MVP VRM animation viewer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ja" className={zenMaruGothic.variable}>
      <body>{children}</body>
    </html>
  );
}
