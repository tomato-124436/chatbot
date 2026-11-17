import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatApp } from "@/app/chat/chat-app";

export default async function ChatPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/");

  const metadata = data.user.user_metadata ?? {};
  const name =
    (typeof metadata.full_name === "string" && metadata.full_name) ||
    (typeof metadata.name === "string" && metadata.name) ||
    data.user.email ||
    "사용자";
  const avatar =
    (typeof metadata.avatar_url === "string" && metadata.avatar_url) ||
    (typeof metadata.picture === "string" && metadata.picture) ||
    "";

  return <ChatApp user={{ name, avatar, email: data.user.email ?? "" }} />;
}
