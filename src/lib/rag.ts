import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText, toVectorLiteral } from "@/lib/embeddings";

export const MATCH_THRESHOLD = 0.35;
export const MATCH_COUNT = 4;

export type RetrievedChunk = {
  id: string;
  source: string;
  content: string;
  similarity: number;
};

export async function retrieveRelevantChunks(supabase: SupabaseClient, question: string) {
  const embedding = await embedText(question, "embedding-query");
  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: toVectorLiteral(embedding),
    match_threshold: MATCH_THRESHOLD,
    match_count: MATCH_COUNT,
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as RetrievedChunk[];
}

export function uniqueSources(chunks: RetrievedChunk[]) {
  return [...new Set(chunks.map((chunk) => chunk.source))];
}

export function buildSystemPrompt(chunks: RetrievedChunk[]) {
  if (chunks.length === 0) {
    return [
      "당신은 모두의 AI입니다. 한국어로 친절하고 정확하게 답하세요.",
      "이번 질문은 제공된 지식 문서와 충분히 관련 있지 않습니다. 일반 지식으로 답하고, 문서에서 확인한 내용인 것처럼 말하지 마세요.",
      "보험 약관처럼 문서에만 있는 수치나 조항은 지어내지 마세요.",
    ].join("\n");
  }

  const context = chunks
    .map((chunk, index) => `[${index + 1}] 출처: ${chunk.source}\n${chunk.content}`)
    .join("\n\n");

  return [
    "당신은 모두의 AI입니다. 한국어로 친절하고 정확하게 답하세요.",
    "아래 참고 문서는 사용자의 질문과 관련 있습니다. 답변은 이 문서에 근거하세요.",
    "문서에 없는 보장 금액, 기간, 예외는 추측하지 말고 문서에 없다고 말하세요.",
    "답변 본문에 출처 이름을 짧게 언급해도 됩니다. 참고 문서 목록은 화면에서 따로 보여 줍니다.",
    "",
    context,
  ].join("\n");
}
