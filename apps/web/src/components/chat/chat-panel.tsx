import {
  CHAT_SESSION_STORAGE_KEY,
  LEGACY_CHAT_SESSION_STORAGE_KEY,
  MAX_MESSAGE_LENGTH,
  type ChatQuotaResponse,
  type ChatMessage,
  type RecentConversation,
} from "@spur/shared";
import { Effect } from "effect";
import {
  Bot,
  Info,
  Loader2,
  MessageSquareText,
  Plus,
  Send,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";
import {
  fetchChatQuota,
  fetchChatHistory,
  fetchRecentConversations,
  sendChatMessage,
} from "#/lib/api";
import { cn } from "#/lib/utils";

const EXAMPLES = [
  "What is your return policy?",
  "Do you ship to the USA?",
  "My item arrived damaged. What should I do?",
];

type ActiveChatSession = {
  sessionId: string;
  conversationName: string;
};

function createOptimisticMessage(sender: "user" | "ai", text: string) {
  return {
    id: crypto.randomUUID(),
    sender,
    text,
    createdAt: new Date().toISOString(),
  } satisfies ChatMessage;
}

function readActiveChatSession() {
  try {
    const value = localStorage.getItem(CHAT_SESSION_STORAGE_KEY);

    if (!value) return undefined;

    const parsed = JSON.parse(value) as ActiveChatSession;

    if (
      typeof parsed?.sessionId === "string" &&
      typeof parsed.conversationName === "string"
    ) {
      return parsed;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function writeActiveChatSession(session: ActiveChatSession) {
  localStorage.setItem(
    CHAT_SESSION_STORAGE_KEY,
    JSON.stringify(session),
  );
}

function clearStoredActiveChatSession() {
  localStorage.removeItem(CHAT_SESSION_STORAGE_KEY);
  localStorage.removeItem(LEGACY_CHAT_SESSION_STORAGE_KEY);
}

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [conversationName, setConversationName] = useState<
    string | undefined
  >();
  const [recentSessions, setRecentSessions] = useState<RecentConversation[]>([]);
  const [quota, setQuota] = useState<ChatQuotaResponse | undefined>();
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const trimmedInput = input.trim();
  const remainingChars = MAX_MESSAGE_LENGTH - input.length;
  const canSend =
    trimmedInput.length > 0 && input.length <= MAX_MESSAGE_LENGTH && !isSending;

  const transcriptLabel = useMemo(() => {
    if (isLoadingHistory) return "Restoring conversation";
    if (messages.length === 0) return "New support conversation";
    return `${messages.length} message${messages.length === 1 ? "" : "s"}`;
  }, [isLoadingHistory, messages.length]);

  const loadRecentConversations = useCallback(async () => {
    try {
      const recent = await Effect.runPromise(fetchRecentConversations());
      setRecentSessions(recent.conversations);
    } catch {
      setRecentSessions([]);
    }
  }, []);

  const loadChatQuota = useCallback(async () => {
    try {
      const nextQuota = await Effect.runPromise(fetchChatQuota());
      setQuota(nextQuota);
    } catch {
      setQuota(undefined);
    }
  }, []);

  useEffect(() => {
    void loadRecentConversations();
    void loadChatQuota();

    const storedSession = readActiveChatSession();
    const legacySessionId = localStorage.getItem(LEGACY_CHAT_SESSION_STORAGE_KEY);
    const storedSessionId = storedSession?.sessionId ?? legacySessionId ?? undefined;

    if (!storedSessionId) {
      setIsLoadingHistory(false);
      return;
    }

    Effect.runPromise(fetchChatHistory(storedSessionId))
      .then((history) => {
        setSessionId(history.sessionId);
        setConversationName(history.conversationName);
        setMessages(history.messages);
        writeActiveChatSession({
          sessionId: history.sessionId,
          conversationName: history.conversationName,
        });
        localStorage.removeItem(LEGACY_CHAT_SESSION_STORAGE_KEY);
      })
      .catch(() => {
        clearStoredActiveChatSession();
      })
      .finally(() => setIsLoadingHistory(false));
  }, [loadChatQuota, loadRecentConversations]);

  useEffect(() => {
    if (messages.length > 0 || isSending) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isSending]);

  const sendMessage = useCallback(
    async (messageText: string) => {
      const text = messageText.trim();

      if (!text || text.length > MAX_MESSAGE_LENGTH || isSending) {
        return;
      }

      setError(undefined);
      setInput("");
      setIsSending(true);
      setMessages((current) => [
        ...current,
        createOptimisticMessage("user", text),
      ]);

      try {
        const response = await Effect.runPromise(
          sendChatMessage({ message: text, sessionId }),
        );

        setSessionId(response.sessionId);
        setConversationName(response.conversationName);
        writeActiveChatSession({
          sessionId: response.sessionId,
          conversationName: response.conversationName,
        });
        void loadRecentConversations();
        void loadChatQuota();
        setMessages((current) => [
          ...current,
          createOptimisticMessage("ai", response.reply),
        ]);
      } catch (sendError) {
        setError(
          sendError instanceof Error
            ? sendError.message
            : "Could not send your message.",
        );
        void loadChatQuota();
      } finally {
        setIsSending(false);
      }
    },
    [isSending, loadChatQuota, loadRecentConversations, sessionId],
  );

  const startNewConversation = useCallback(() => {
    clearStoredActiveChatSession();
    setSessionId(undefined);
    setConversationName(undefined);
    setMessages([]);
    setInput("");
    setError(undefined);
  }, []);

  const selectRecentSession = useCallback(async (selectedSessionId: string) => {
    if (!selectedSessionId) return;

    setIsLoadingHistory(true);
    setError(undefined);
    setInput("");

    try {
      const history = await Effect.runPromise(
        fetchChatHistory(selectedSessionId),
      );

      setSessionId(history.sessionId);
      setConversationName(history.conversationName);
      setMessages(history.messages);
      writeActiveChatSession({
        sessionId: history.sessionId,
        conversationName: history.conversationName,
      });
      void loadRecentConversations();
    } catch (historyError) {
      clearStoredActiveChatSession();
      setSessionId(undefined);
      setConversationName(undefined);
      setMessages([]);
      setError(
        historyError instanceof Error
          ? historyError.message
          : "Could not restore that chat.",
      );
    } finally {
      setIsLoadingHistory(false);
    }
  }, [loadRecentConversations]);

  return (
    <main className="min-h-screen bg-[var(--app-bg)] px-4 py-6 text-[var(--ink)] sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-4xl">
        <section className="flex min-h-[720px] w-full flex-col border border-[var(--line)] bg-[var(--paper)] shadow-[var(--shadow)]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">SpurAI Support Agent</p>
                <div className="group relative grid size-7 place-items-center">
                  <Info
                    aria-hidden="true"
                    className="size-4 text-[var(--muted)]"
                  />
                  <span className="pointer-events-none absolute left-1/2 top-8 z-10 hidden w-64 -translate-x-1/2 rounded-md border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-xs font-medium leading-5 text-[var(--paper)] shadow-lg group-hover:block">
                    Answers store support questions using Spur policy context
                    and keeps recent chats available for this browser.
                  </span>
                  <span className="sr-only">
                    Answers store support questions using Spur policy context
                    and keeps recent chats available for this browser.
                  </span>
                </div>
              </div>
              <p className="text-xs text-[var(--muted)]">
                {conversationName ?? transcriptLabel}
              </p>
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <label className="sr-only" htmlFor="recent-session">
                Recent chats
              </label>
              <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
                <MessageSquareText className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
                <select
                  className="h-10 w-full appearance-none rounded-md border border-[var(--line)] bg-[var(--panel)] py-2 pl-9 pr-8 text-sm font-medium text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSending || isLoadingHistory}
                  id="recent-session"
                  onChange={(event) => {
                    void selectRecentSession(event.target.value);
                  }}
                  value={sessionId ?? ""}
                >
                  <option value="">Recent chats</option>
                  {recentSessions.map((session) => (
                    <option key={session.sessionId} value={session.sessionId}>
                      {session.conversationName}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                aria-label="Start new chat"
                disabled={isSending || isLoadingHistory}
                onClick={startNewConversation}
                size="icon"
                variant="secondary"
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {messages.length === 0 && !isLoadingHistory ? (
              <div className="grid min-h-full place-items-center">
                <div className="w-full max-w-xl text-center">
                  <div className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--panel-strong)] text-[var(--accent)]">
                    <Bot className="size-6" />
                  </div>
                  <h2 className="mt-4 text-xl font-semibold">
                    Start with a real support question
                  </h2>
                  <div className="mt-5 grid gap-2 sm:grid-cols-3">
                    {EXAMPLES.map((example) => (
                      <button
                        className="rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-left text-sm leading-5 transition hover:border-[var(--accent)] hover:bg-[var(--panel-strong)]"
                        key={example}
                        onClick={() => setInput(example)}
                        type="button"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {isLoadingHistory ? (
              <div className="space-y-3">
                <div className="h-16 w-3/4 animate-pulse rounded-md bg-[var(--panel)]" />
                <div className="ml-auto h-16 w-2/3 animate-pulse rounded-md bg-[var(--panel-strong)]" />
              </div>
            ) : null}

            <div className="space-y-4">
              {messages.map((message) => (
                <article
                  className={cn(
                    "flex gap-3",
                    message.sender === "user" && "justify-end",
                  )}
                  key={message.id}
                >
                  {message.sender === "ai" ? (
                    <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[var(--paper)]">
                      <Bot className="size-4" />
                    </div>
                  ) : null}
                  <div
                    className={cn(
                      "max-w-[78%] rounded-md px-4 py-3 text-sm leading-6 shadow-sm",
                      message.sender === "user"
                        ? "bg-[var(--accent)] text-white"
                        : "border border-[var(--line)] bg-[var(--panel)]",
                    )}
                  >
                    {message.text}
                  </div>
                  {message.sender === "user" ? (
                    <div className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--paper)] text-[var(--muted)]">
                      <UserRound className="size-4" />
                    </div>
                  ) : null}
                </article>
              ))}

              {isSending ? (
                <article className="flex gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[var(--paper)]">
                    <Bot className="size-4" />
                  </div>
                  <div className="flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--muted)] shadow-sm">
                    <Loader2 className="size-4 animate-spin" />
                    Agent is typing
                  </div>
                </article>
              ) : null}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <footer className="border-t border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5">
            {error ? <Alert className="mb-3">{error}</Alert> : null}
            <form
              className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void sendMessage(input);
              }}
            >
              <div className="min-w-0 flex-1">
                <Textarea
                  aria-label="Message"
                  disabled={isSending || isLoadingHistory}
                  maxLength={MAX_MESSAGE_LENGTH + 1}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage(input);
                    }
                  }}
                  placeholder="Ask a support question..."
                  rows={1}
                  value={input}
                />
                <p
                  className={cn(
                    "mt-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-right text-xs text-[var(--muted)]",
                    remainingChars < 0 && "text-[var(--danger)]",
                  )}
                >
                  <span>{remainingChars} characters left</span>
                  {quota ? (
                    <>
                      <span>
                        {quota.messagesRemaining}/{quota.messagesPerMinute}{" "}
                        messages left
                      </span>
                      <span>
                        {quota.dailyTokensRemaining.toLocaleString()}/
                        {quota.dailyTokenLimit.toLocaleString()} tokens left
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
              <Button
                aria-label="Send message"
                className="size-11"
                disabled={!canSend || isLoadingHistory}
                size="icon"
                type="submit"
              >
                {isSending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </form>
          </footer>
        </section>
      </section>
    </main>
  );
}
