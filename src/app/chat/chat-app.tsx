"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type SourceName = string;

type ChatMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceName[];
  created_at?: string;
};

type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type Profile = {
  name: string;
  avatar: string;
  email: string;
};

const suggestions = [
  "반려동물 사망 시 위로금은 언제 지급되나요?",
  "배상책임 특별약관에서 보상하지 않는 손해는 무엇인가요?",
  "보험금은 청구 후 얼마나 걸려 지급되나요?",
];

export function ChatApp({ user }: { user: Profile }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadConversations();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading]);

  async function loadConversations() {
    const response = await fetch("/api/conversations");
    if (!response.ok) return;
    const data = await response.json();
    setConversations(data.conversations ?? []);
  }

  async function openConversation(id: string) {
    if (isLoading) return;
    setSidebarOpen(false);
    setError("");
    setActiveId(id);
    const response = await fetch(`/api/conversations/${id}`);
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "대화를 불러오지 못했어요.");
      return;
    }
    setMessages(
      (data.messages ?? []).map((message: ChatMessage) => ({
        ...message,
        sources: Array.isArray(message.sources) ? message.sources : [],
      })),
    );
  }

  function startNewChat() {
    if (isLoading) return;
    setActiveId(null);
    setMessages([]);
    setError("");
    setInput("");
    setSidebarOpen(false);
    textareaRef.current?.focus();
  }

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || isLoading) return;

    const optimistic: ChatMessage[] = [...messages, { role: "user", content, created_at: new Date().toISOString() }];
    setMessages([...optimistic, { role: "assistant", content: "", sources: [] }]);
    setInput("");
    setError("");
    setNotice("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, content }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "응답을 불러오지 못했어요.");
      }
      if (!response.body) throw new Error("응답 스트림을 시작하지 못했어요.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      let sources: string[] = [];

      const apply = (nextAnswer: string, nextSources: string[]) => {
        setMessages([...optimistic, { role: "assistant", content: nextAnswer, sources: nextSources }]);
      };

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
          const parsed = JSON.parse(data);
          if (parsed.type === "meta") {
            sources = Array.isArray(parsed.sources) ? parsed.sources : [];
            if (parsed.retrievalNote) setNotice(parsed.retrievalNote);
            if (parsed.conversation) {
              setActiveId(parsed.conversation.id);
              setConversations((current) => [parsed.conversation, ...current.filter((item) => item.id !== parsed.conversation.id)]);
            } else if (parsed.conversationId) {
              setActiveId(parsed.conversationId);
            }
            apply(answer, sources);
          } else if (parsed.type === "delta" && typeof parsed.content === "string") {
            answer += parsed.content;
            apply(answer, sources);
          } else if (parsed.type === "error") {
            throw new Error(parsed.error);
          }
        }
      }
      void loadConversations();
    } catch (sendError) {
      setMessages(optimistic);
      setError(sendError instanceof Error ? sendError.message : "문제가 발생했어요.");
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <main className="chat-shell">
      <aside className={`sidebar${sidebarOpen ? " is-open" : ""}`}>
        <div className="sidebar-head">
          <span className="brand">
            <span className="brand-mark" aria-hidden="true">모</span>
            모두의 AI
          </span>
          <button className="new-chat-button" type="button" onClick={startNewChat}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
            새 대화
          </button>
        </div>
        <nav className="conversation-list" aria-label="채팅방">
          {conversations.length === 0 && <p className="empty-list">저장된 대화가 아직 없어요.</p>}
          {conversations.map((conversation) => (
            <button
              className={`conversation-item${conversation.id === activeId ? " is-active" : ""}`}
              key={conversation.id}
              type="button"
              onClick={() => void openConversation(conversation.id)}
            >
              <span>{conversation.title}</span>
              <time dateTime={conversation.created_at}>{formatTime(conversation.created_at)}</time>
            </button>
          ))}
        </nav>
        <div className="profile">
          {user.avatar ? (
            // Google profile images are served from a third-party host.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="profile-fallback" aria-hidden="true">{user.name.slice(0, 1)}</span>
          )}
          <div>
            <strong>{user.name}</strong>
            {user.email && <small>{user.email}</small>}
          </div>
          <form action="/auth/logout" method="post">
            <button type="submit">로그아웃</button>
          </form>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-backdrop" type="button" aria-label="메뉴 닫기" onClick={() => setSidebarOpen(false)} />}

      <section className="chat-main">
        <header className="topbar">
          <button className="menu-button" type="button" onClick={() => setSidebarOpen(true)} aria-label="채팅방 목록">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
          </button>
          <span className="model-label"><span className="status-dot" /> 문서 기반 답변</span>
        </header>

        <div className={`chat-area${isEmpty ? " is-empty" : ""}`}>
          {isEmpty ? (
            <div className="welcome">
              <div className="welcome-sparkle" aria-hidden="true">✳</div>
              <p className="eyebrow">KB 반려행복펫보험 약관</p>
              <h1>안녕하세요, <span>{user.name}님</span></h1>
              <p className="welcome-copy">약관과 관련된 질문은 문서를 찾아 답하고,<br className="mobile-break" /> 그렇지 않은 질문은 일반 대화로 이어갑니다.</p>
              <div className="suggestions" aria-label="추천 질문">
                {suggestions.map((prompt) => (
                  <button className="suggestion-card" key={prompt} type="button" onClick={() => void sendMessage(prompt)}>
                    <span>{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="conversation" aria-live="polite">
              {messages.map((message, index) => (
                <article className={`message message-${message.role}`} key={`${message.id ?? index}-${message.role}`}>
                  {message.role === "assistant" && <span className="assistant-avatar" aria-hidden="true">모</span>}
                  <div className="message-content">
                    {message.content ? <p>{message.content}</p> : isLoading && index === messages.length - 1 ? <span className="typing-indicator"><i /><i /><i /></span> : null}
                    {message.role === "assistant" && message.sources && message.sources.length > 0 && (
                      <div className="sources">
                        <span>참고 문서</span>
                        {message.sources.map((source) => <em key={source}>{source}</em>)}
                      </div>
                    )}
                    {message.created_at && <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>}
                  </div>
                </article>
              ))}
              {notice && <p className="error-message">{notice}</p>}
              {error && <p className="error-message" role="alert">{error}</p>}
              <div ref={bottomRef} />
            </div>
          )}

          <div className="composer-wrap">
            <form className="composer" onSubmit={handleSubmit}>
              <textarea
                ref={textareaRef}
                aria-label="메시지 입력"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="약관이나 일상적인 질문을 입력해 보세요..."
                rows={1}
                value={input}
              />
              <div className="composer-footer">
                <span className="composer-hint"><kbd>↵</kbd> 전송</span>
                <button className="send-button" disabled={!input.trim() || isLoading} type="submit" aria-label="메시지 보내기">
                  {isLoading ? <span className="send-spinner" /> : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 15V5m0 0L5.5 9.5M10 5l4.5 4.5" /></svg>}
                </button>
              </div>
            </form>
            <p className="disclaimer">모두의 AI는 참고 문서를 우선하지만, 중요한 계약 내용은 약관 원문과 다시 확인해 주세요.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
