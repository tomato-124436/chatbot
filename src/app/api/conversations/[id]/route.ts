import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || !claims?.claims) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, title, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (conversationError) return NextResponse.json({ error: conversationError.message }, { status: 500 });
  if (!conversation) return NextResponse.json({ error: "대화를 찾지 못했어요." }, { status: 404 });

  const { data: messages, error } = await supabase
    .from("messages")
    .select("id, role, content, sources, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversation, messages: messages ?? [] });
}
