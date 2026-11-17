import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "모두의 AI",
  description: "문서에 근거해 답하고, 대화는 계정에 저장되는 AI 챗봇입니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
