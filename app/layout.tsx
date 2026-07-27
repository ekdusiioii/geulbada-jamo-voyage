import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "글자바다 — 자모 항해 게임",
  description: "배를 조종해 국어 자음과 모음을 모으고 단어를 완성하는 3D 항해 게임",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "글자바다 — 자모 항해 게임",
    description: "자모를 모아, 단어의 섬으로",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "글자바다 게임" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "글자바다 — 자모 항해 게임",
    description: "자모를 모아, 단어의 섬으로",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
