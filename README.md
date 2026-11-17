# 모두의 AI

Next.js 챗봇입니다. Google 계정으로 로그인한 뒤 대화하고, 질문이 KB 반려행복펫보험 약관과 관련 있을 때만 문서를 검색해 근거로 답합니다. 답변 아래에는 참고한 문서(조항) 이름이 표시됩니다.

## 로컬 실행

```bash
npm run dev
```

`http://localhost:3000`에서 랜딩 페이지를 확인할 수 있습니다. 로그인하지 않은 상태에서 `/chat`으로 가면 랜딩 페이지로 돌아갑니다.

## 구성 요소

| 항목 | 사용 기술 |
| --- | --- |
| 로그인 | Supabase Auth + Google OAuth |
| 대화 저장 | Supabase Postgres (`conversations`, `messages`) |
| 문서 임베딩 | Upstage `embedding-passage` / `embedding-query` (4096차원) |
| 문서 저장·검색 | Supabase pgvector (`documents` 테이블, `match_documents` 함수) |
| 답변 생성 | OpenAI Chat Completions (스트리밍) |

## 처음 한 번만

1. Supabase SQL Editor에서 `supabase/migrations/20261117000000_rag_chat.sql`을 실행합니다.
2. Authentication → Sign In / Providers에서 Google을 켭니다.
   - Client ID / Secret: Google Cloud → Google 인증 플랫폼 → 클라이언트에서 발급
   - 승인된 리디렉션 URI: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Authentication → URL Configuration에 앱의 콜백 주소를 추가합니다.
   - `http://localhost:3000/auth/callback`
4. 문서를 임베딩해 저장합니다.

```bash
npm run ingest
```

`npm run ingest`는 `dataset/kb.pdf`를 페이지 단위로 나누고, 청크별 임베딩을 만들어 `replace_documents` RPC로 저장합니다. 다시 실행하면 기존 문서를 모두 교체합니다.

## 환경 변수

`.env.local`에만 두고 커밋하지 않습니다. 형식은 `.env.example`을 참고하세요.

| 변수 | 설명 |
| --- | --- |
| `OPENAI_API_KEY` | 답변 생성용 |
| `OPENAI_MODEL` | 기본값 `gpt-4o-mini` |
| `UPSTAGE_API_KEY` | 문서·질문 임베딩용 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable 키 |
| `INGEST_SECRET` | 문서 적재 RPC 호출용 비밀값 (DB에는 SHA-256만 저장) |

## 동작 방식

1. 질문을 `embedding-query`로 임베딩하고 `match_documents`로 유사도 0.35 이상 청크를 최대 4개 찾습니다.
2. 관련 청크가 있으면 그 내용을 시스템 프롬프트에 넣어 답변하고, 참고한 문서 이름을 함께 저장·표시합니다.
3. 관련 청크가 없으면 일반 대화로 답하고 출처를 표시하지 않습니다.
