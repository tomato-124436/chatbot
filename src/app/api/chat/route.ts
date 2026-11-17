import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildSystemPrompt, retrieveRelevantChunks, uniqueSources } from "@/lib/rag";

export const runtime = "nodejs";
export const maxDuration = 60;

type StoredMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY가 설정되지 않았어요." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: claimsData, error: authError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (authError || !userId) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  let conversationId: string | null = null;
  let content = "";
  try {
    const body = await request.json();
    content = typeof body.content === "string" ? body.content.trim() : "";
    conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
    if (!content || content.length > 4000) {
      return NextResponse.json({ error: "질문을 1자 이상 4000자 이하로 입력해 주세요." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "요청을 읽지 못했어요." }, { status: 400 });
  }

  let createdConversation: { id: string; title: string; created_at: string } | null = null;
  if (!conversationId) {
    const title = content.length > 28 ? `${content.slice(0, 28)}…` : content;
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: userId, title })
      .select("id, title, created_at")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "대화를 만들지 못했어요." }, { status: 500 });
    }
    conversationId = data.id;
    createdConversation = data;
  } else {
    const { data, error } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "대화를 찾지 못했어요." }, { status: 404 });
  }

  const { error: userMessageError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    user_id: userId,
    role: "user",
    content,
  });
  if (userMessageError) {
    return NextResponse.json({ error: userMessageError.message }, { status: 500 });
  }

  let chunks: Awaited<ReturnType<typeof retrieveRelevantChunks>> = [];
  let retrievalNote = "";
  try {
    chunks = await retrieveRelevantChunks(supabase, content);
  } catch (error) {
    retrievalNote = error instanceof Error ? error.message : "문서 검색에 실패했어요.";
    chunks = [];
  }

  const sources = uniqueSources(chunks);
  const { data: history, error: historyError } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(20);

  if (historyError) return NextResponse.json({ error: historyError.message }, { status: 500 });

  const messages = [
    { role: "system", content: buildSystemPrompt(chunks) },
    ...((history ?? []) as StoredMessage[]).map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];

  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages,
        stream: true,
      }),
    });
  } catch {
    return NextResponse.json({ error: "AI 서버에 연결하지 못했어요." }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const errorBody = await upstream.json().catch(() => null);
    return NextResponse.json(
      { error: errorBody?.error?.message ?? "AI 응답을 가져오지 못했어요." },
      { status: upstream.status || 502 },
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();
  let answer = "";
  let buffer = "";

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      send({
        type: "meta",
        conversation: createdConversation,
        conversationId,
        sources,
        retrievalNote,
      });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            const data = event
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .join("\n");
            if (!data || data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const text = parsed.choices?.[0]?.delta?.content;
              if (typeof text === "string" && text) {
                answer += text;
                send({ type: "delta", content: text });
              }
            } catch {
              // Ignore incomplete SSE events.
            }
          }
        }

        if (answer.trim()) {
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            user_id: userId,
            role: "assistant",
            content: answer,
            sources: sources.length > 0 ? sources : null,
          });
        }
        send({ type: "done" });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch {
        send({ type: "error", error: "응답을 마무리하지 못했어요." });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
