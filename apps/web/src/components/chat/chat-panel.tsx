import {
  CHAT_SESSION_STORAGE_KEY,
  MAX_MESSAGE_LENGTH,
  type ChatMessage,
} from "@spur/shared";
import { Effect } from "effect";
import { Bot, Loader2, RotateCcw, Send, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";
import { fetchChatHistory, sendChatMessage } from "#/lib/api";
import { cn } from "#/lib/utils";

const EXAMPLES = [
  "What is your return policy?",
  "Do you ship to the USA?",
  "My item arrived damaged. What should I do?",
];

function createOptimisticMessage(sender: "user" | "ai", text: string) {
  return {
    id: crypto.randomUUID(),
    sender,
    text,
    createdAt: new Date().toISOString(),
  } satisfies ChatMessage;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
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

  useEffect(() => {
    const storedSessionId = localStorage.getItem(CHAT_SESSION_STORAGE_KEY);

    if (!storedSessionId) {
      setIsLoadingHistory(false);
      return;
    }

    Effect.runPromise(fetchChatHistory(storedSessionId))
      .then((history) => {
        setSessionId(history.sessionId);
        setMessages(history.messages);
      })
      .catch(() => {
        localStorage.removeItem(CHAT_SESSION_STORAGE_KEY);
      })
      .finally(() => setIsLoadingHistory(false));
  }, []);

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
        localStorage.setItem(CHAT_SESSION_STORAGE_KEY, response.sessionId);
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
      } finally {
        setIsSending(false);
      }
    },
    [isSending, sessionId],
  );

  const resetConversation = useCallback(() => {
    localStorage.removeItem(CHAT_SESSION_STORAGE_KEY);
    setSessionId(undefined);
    setMessages([]);
    setInput("");
    setError(undefined);
  }, []);

  return (
    <main className="min-h-screen bg-[var(--app-bg)] px-4 py-6 text-[var(--ink)] sm:px-6 lg:px-8">
      <section className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex flex-col justify-between border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[var(--shadow)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              Spur support lab
            </p>
            <h1 className="mt-4 max-w-64 text-3xl font-semibold leading-tight text-[var(--ink)]">
              Live chat that remembers the thread.
            </h1>
            <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
              Ask about shipping, returns, support hours, cancellations, or
              damaged deliveries. The agent answers from seeded store policy.
            </p>
          </div>

          <div className="mt-8 space-y-3">
            <div className="rounded-md border border-[var(--line)] bg-[var(--paper)] p-3">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
                Session
              </p>
              <p className="mt-2 break-all text-sm font-medium">
                {sessionId ?? "Not started"}
              </p>
            </div>
            <Button
              className="w-full justify-between"
              disabled={isSending}
              onClick={resetConversation}
              variant="secondary"
            >
              New chat
              <RotateCcw className="size-4" />
            </Button>
          </div>
        </aside>

        <section className="flex min-h-[720px] flex-col border border-[var(--line)] bg-[var(--paper)] shadow-[var(--shadow)]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-5">
            <div>
              <p className="text-sm font-semibold">AI support agent</p>
              <p className="text-xs text-[var(--muted)]">{transcriptLabel}</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <span className="size-2 rounded-full bg-[var(--success)]" />
              Ready
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
              className="flex items-end gap-3"
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
                  placeholder="Ask about returns, shipping, support hours..."
                  rows={1}
                  value={input}
                />
                <p
                  className={cn(
                    "mt-1 text-right text-xs text-[var(--muted)]",
                    remainingChars < 0 && "text-[var(--danger)]",
                  )}
                >
                  {remainingChars} characters left
                </p>
              </div>
              <Button
                aria-label="Send message"
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
