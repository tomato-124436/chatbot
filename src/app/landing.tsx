"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const features = [
  { title: "문서 기반 답변", copy: "KB 반려행복펫보험 약관을 근거로, 관련된 질문에만 문서를 찾아 답합니다." },
  { title: "대화 기록", copy: "채팅방마다 질문, 답변, 생성 시간이 계정에 저장됩니다." },
  { title: "Google 계정", copy: "로그인하면 프로필과 함께 이어서 대화를 확인할 수 있습니다." },
];

export function Landing({ authError }: { authError: boolean }) {
  const [error, setError] = useState(authError ? "Google 로그인에 실패했어요. 잠시 후 다시 시도해 주세요." : "");
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    setError("");
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (signInError) {
      setPending(false);
      setError("Google 로그인을 시작하지 못했어요. Supabase에서 Google 제공자가 켜져 있는지 확인해 주세요.");
    }
  }

  return (
    <main className="landing">
      <header className="landing-nav">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">모</span>
          모두의 AI
        </span>
      </header>
      <section className="landing-hero">
        <p className="eyebrow">DOCUMENT-GROUNDED ASSISTANT</p>
        <h1>모두의 AI</h1>
        <p className="landing-copy">
          보험 약관처럼 긴 문서에서 필요한 답을 찾아 주는 챗봇입니다.
          Google 계정으로 시작한 대화는 채팅방별로 저장되고, 문서와 관련된 질문에는 참고한 출처도 함께 보여 줍니다.
        </p>
        <button className="google-button" type="button" onClick={() => void signIn()} disabled={pending}>
          <GoogleMark />
          {pending ? "Google로 이동 중..." : "Google로 시작하기"}
        </button>
        {error && <p className="landing-error" role="alert">{error}</p>}
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <h2>{feature.title}</h2>
              <p>{feature.copy}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}
