const UPSTAGE_URL = "https://api.upstage.ai/v1/embeddings";

export async function embedText(input: string, model: "embedding-query" | "embedding-passage") {
  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) throw new Error("UPSTAGE_API_KEY가 설정되지 않았어요.");

  const response = await fetch(UPSTAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input }),
  });

  const body = await response.json().catch(() => null);
  const embedding = body?.data?.[0]?.embedding;
  if (!response.ok || !Array.isArray(embedding)) {
    throw new Error(body?.error?.message ?? "문서 임베딩을 만들지 못했어요.");
  }
  return embedding as number[];
}

export function toVectorLiteral(embedding: number[]) {
  return `[${embedding.join(",")}]`;
}
