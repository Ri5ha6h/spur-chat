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
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
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
  localStorage.setItem(CHAT_SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearStoredActiveChatSession() {
  localStorage.removeItem(CHAT_SESSION_STORAGE_KEY);
  localStorage.removeItem(LEGACY_CHAT_SESSION_STORAGE_KEY);
}

type ChatPanelState = {
  messages: ChatMessage[];
  input: string;
  sessionId: string | undefined;
  conversationName: string | undefined;
  recentSessions: RecentConversation[];
  quota: ChatQuotaResponse | undefined;
  isLoadingHistory: boolean;
  isSending: boolean;
  error: string | undefined;
};

type ChatPanelAction =
  | { type: "inputChanged"; input: string }
  | { type: "recentLoaded"; recentSessions: RecentConversation[] }
  | { type: "recentFailed" }
  | { type: "quotaLoaded"; quota: ChatQuotaResponse }
  | { type: "quotaFailed" }
  | {
      type: "historyLoaded";
      sessionId: string;
      conversationName: string;
      messages: ChatMessage[];
    }
  | { type: "historyMissing" }
  | { type: "storedHistoryFailed" }
  | { type: "selectSessionStarted" }
  | { type: "selectSessionFailed"; error: string }
  | { type: "startSending"; text: string }
  | {
      type: "messageSent";
      sessionId: string;
      conversationName: string;
      reply: string;
    }
  | { type: "messageFailed"; error: string }
  | { type: "startNewConversation" };

const initialChatPanelState: ChatPanelState = {
  messages: [],
  input: "",
  sessionId: undefined,
  conversationName: undefined,
  recentSessions: [],
  quota: undefined,
  isLoadingHistory: true,
  isSending: false,
  error: undefined,
};

function chatPanelReducer(
  state: ChatPanelState,
  action: ChatPanelAction,
): ChatPanelState {
  switch (action.type) {
    case "inputChanged":
      return { ...state, input: action.input };
    case "recentLoaded":
      return { ...state, recentSessions: action.recentSessions };
    case "recentFailed":
      return { ...state, recentSessions: [] };
    case "quotaLoaded":
      return { ...state, quota: action.quota };
    case "quotaFailed":
      return { ...state, quota: undefined };
    case "historyLoaded":
      return {
        ...state,
        sessionId: action.sessionId,
        conversationName: action.conversationName,
        messages: action.messages,
        isLoadingHistory: false,
      };
    case "historyMissing":
    case "storedHistoryFailed":
      return { ...state, isLoadingHistory: false };
    case "selectSessionStarted":
      return {
        ...state,
        isLoadingHistory: true,
        error: undefined,
        input: "",
      };
    case "selectSessionFailed":
      return {
        ...state,
        sessionId: undefined,
        conversationName: undefined,
        messages: [],
        error: action.error,
        isLoadingHistory: false,
      };
    case "startSending":
      return {
        ...state,
        error: undefined,
        input: "",
        isSending: true,
        messages: [
          ...state.messages,
          createOptimisticMessage("user", action.text),
        ],
      };
    case "messageSent":
      return {
        ...state,
        sessionId: action.sessionId,
        conversationName: action.conversationName,
        isSending: false,
        messages: [
          ...state.messages,
          createOptimisticMessage("ai", action.reply),
        ],
      };
    case "messageFailed":
      return {
        ...state,
        error: action.error,
        isSending: false,
      };
    case "startNewConversation":
      return {
        ...state,
        sessionId: undefined,
        conversationName: undefined,
        messages: [],
        input: "",
        error: undefined,
      };
    default:
      return state;
  }
}

type ChatHeaderProps = {
  conversationName: string | undefined;
  isLoadingHistory: boolean;
  isSending: boolean;
  onSelectRecentSession: (sessionId: string) => void;
  onStartNewConversation: () => void;
  recentSessions: RecentConversation[];
  sessionId: string | undefined;
  transcriptLabel: string;
};

function ChatHeader({
  conversationName,
  isLoadingHistory,
  isSending,
  onSelectRecentSession,
  onStartNewConversation,
  recentSessions,
  sessionId,
  transcriptLabel,
}: ChatHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">SpurAI Support Agent</p>
          <div className="group relative grid size-7 place-items-center">
            <Info aria-hidden="true" className="size-4 text-[var(--muted)]" />
            <span className="pointer-events-none absolute left-1/2 top-8 z-10 hidden w-64 -translate-x-1/2 rounded-md border border-[var(--line)] bg-[var(--ink)] px-3 py-2 text-xs font-medium leading-5 text-[var(--paper)] shadow-lg group-hover:block">
              Answers store support questions using Spur policy context and
              keeps recent chats available for this browser.
            </span>
            <span className="sr-only">
              Answers store support questions using Spur policy context and
              keeps recent chats available for this browser.
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
            onChange={(event) => onSelectRecentSession(event.target.value)}
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
          onClick={onStartNewConversation}
          size="icon"
          variant="secondary"
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </header>
  );
}

type ChatMessagesProps = {
  isLoadingHistory: boolean;
  isSending: boolean;
  messages: ChatMessage[];
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onExampleSelect: (example: string) => void;
};

function ChatMessages({
  isLoadingHistory,
  isSending,
  messages,
  messagesEndRef,
  onExampleSelect,
}: ChatMessagesProps) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
      {messages.length === 0 && !isLoadingHistory ? (
        <EmptyChatState onExampleSelect={onExampleSelect} />
      ) : null}

      {isLoadingHistory ? <LoadingHistoryState /> : null}

      <div className="space-y-4">
        {messages.map((message) => (
          <ChatMessageItem key={message.id} message={message} />
        ))}

        {isSending ? <SendingIndicator /> : null}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

function EmptyChatState({
  onExampleSelect,
}: {
  onExampleSelect: (example: string) => void;
}) {
  return (
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
              onClick={() => onExampleSelect(example)}
              type="button"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LoadingHistoryState() {
  return (
    <div className="space-y-3">
      <div className="h-16 w-3/4 animate-pulse rounded-md bg-[var(--panel)]" />
      <div className="ml-auto h-16 w-2/3 animate-pulse rounded-md bg-[var(--panel-strong)]" />
    </div>
  );
}

function ChatMessageItem({ message }: { message: ChatMessage }) {
  return (
    <article
      className={cn("flex gap-3", message.sender === "user" && "justify-end")}
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
  );
}

function SendingIndicator() {
  return (
    <article className="flex gap-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[var(--paper)]">
        <Bot className="size-4" />
      </div>
      <div className="flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--muted)] shadow-sm">
        <Loader2 className="size-4 animate-spin" />
        Agent is typing
      </div>
    </article>
  );
}

type ChatComposerProps = {
  canSend: boolean;
  error: string | undefined;
  input: string;
  isLoadingHistory: boolean;
  isSending: boolean;
  onInputChange: (input: string) => void;
  onSend: (input: string) => void;
  quota: ChatQuotaResponse | undefined;
  remainingChars: number;
};

function ChatComposer({
  canSend,
  error,
  input,
  isLoadingHistory,
  isSending,
  onInputChange,
  onSend,
  quota,
  remainingChars,
}: ChatComposerProps) {
  return (
    <footer className="border-t border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5">
      {error ? <Alert className="mb-3">{error}</Alert> : null}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0 flex-1">
          <Textarea
            aria-label="Message"
            disabled={isSending || isLoadingHistory}
            maxLength={MAX_MESSAGE_LENGTH + 1}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend(input);
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
                  {quota.messagesRemaining}/{quota.messagesPerMinute} messages
                  left
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
          onClick={() => onSend(input)}
          size="icon"
          type="button"
        >
          {isSending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>
    </footer>
  );
}

export function ChatPanel() {
  const [state, dispatch] = useReducer(chatPanelReducer, initialChatPanelState);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const trimmedInput = state.input.trim();
  const remainingChars = MAX_MESSAGE_LENGTH - state.input.length;
  const canSend =
    trimmedInput.length > 0 &&
    state.input.length <= MAX_MESSAGE_LENGTH &&
    !state.isSending;

  const transcriptLabel = useMemo(() => {
    if (state.isLoadingHistory) return "Restoring conversation";
    if (state.messages.length === 0) return "New support conversation";
    return `${state.messages.length} message${state.messages.length === 1 ? "" : "s"}`;
  }, [state.isLoadingHistory, state.messages.length]);

  const scrollToLatestMessage = useCallback(() => {
    window.setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 0);
  }, []);

  const loadRecentConversations = useCallback(async () => {
    try {
      const recent = await Effect.runPromise(fetchRecentConversations());
      dispatch({
        type: "recentLoaded",
        recentSessions: recent.conversations,
      });
    } catch {
      dispatch({ type: "recentFailed" });
    }
  }, []);

  const loadChatQuota = useCallback(async () => {
    try {
      const nextQuota = await Effect.runPromise(fetchChatQuota());
      dispatch({ type: "quotaLoaded", quota: nextQuota });
    } catch {
      dispatch({ type: "quotaFailed" });
    }
  }, []);

  useEffect(() => {
    void loadRecentConversations();
    void loadChatQuota();

    const storedSession = readActiveChatSession();
    const legacySessionId = localStorage.getItem(
      LEGACY_CHAT_SESSION_STORAGE_KEY,
    );
    const storedSessionId =
      storedSession?.sessionId ?? legacySessionId ?? undefined;

    if (!storedSessionId) {
      dispatch({ type: "historyMissing" });
      return;
    }

    Effect.runPromise(fetchChatHistory(storedSessionId))
      .then((history) => {
        dispatch({
          type: "historyLoaded",
          sessionId: history.sessionId,
          conversationName: history.conversationName,
          messages: history.messages,
        });
        writeActiveChatSession({
          sessionId: history.sessionId,
          conversationName: history.conversationName,
        });
        localStorage.removeItem(LEGACY_CHAT_SESSION_STORAGE_KEY);
        scrollToLatestMessage();
      })
      .catch(() => {
        clearStoredActiveChatSession();
        dispatch({ type: "storedHistoryFailed" });
      });
  }, [loadChatQuota, loadRecentConversations, scrollToLatestMessage]);

  const sendMessage = useCallback(
    async (messageText: string) => {
      const text = messageText.trim();

      if (!text || text.length > MAX_MESSAGE_LENGTH || state.isSending) {
        return;
      }

      dispatch({ type: "startSending", text });
      scrollToLatestMessage();

      try {
        const response = await Effect.runPromise(
          sendChatMessage({ message: text, sessionId: state.sessionId }),
        );

        writeActiveChatSession({
          sessionId: response.sessionId,
          conversationName: response.conversationName,
        });
        void loadRecentConversations();
        void loadChatQuota();
        dispatch({
          type: "messageSent",
          sessionId: response.sessionId,
          conversationName: response.conversationName,
          reply: response.reply,
        });
        scrollToLatestMessage();
      } catch (sendError) {
        dispatch({
          type: "messageFailed",
          error:
            sendError instanceof Error
              ? sendError.message
              : "Could not send your message.",
        });
        void loadChatQuota();
      }
    },
    [
      loadChatQuota,
      loadRecentConversations,
      scrollToLatestMessage,
      state.isSending,
      state.sessionId,
    ],
  );

  const startNewConversation = useCallback(() => {
    clearStoredActiveChatSession();
    dispatch({ type: "startNewConversation" });
  }, []);

  const selectRecentSession = useCallback(
    async (selectedSessionId: string) => {
      if (!selectedSessionId) return;

      dispatch({ type: "selectSessionStarted" });

      try {
        const history = await Effect.runPromise(
          fetchChatHistory(selectedSessionId),
        );

        dispatch({
          type: "historyLoaded",
          sessionId: history.sessionId,
          conversationName: history.conversationName,
          messages: history.messages,
        });
        writeActiveChatSession({
          sessionId: history.sessionId,
          conversationName: history.conversationName,
        });
        void loadRecentConversations();
        scrollToLatestMessage();
      } catch (historyError) {
        clearStoredActiveChatSession();
        dispatch({
          type: "selectSessionFailed",
          error:
            historyError instanceof Error
              ? historyError.message
              : "Could not restore that chat.",
        });
      }
    },
    [loadRecentConversations, scrollToLatestMessage],
  );

  return (
    <main className="min-h-screen bg-[var(--app-bg)] px-4 py-6 text-[var(--ink)] sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-4xl">
        <section className="flex min-h-[720px] w-full flex-col border border-[var(--line)] bg-[var(--paper)] shadow-[var(--shadow)]">
          <ChatHeader
            conversationName={state.conversationName}
            isLoadingHistory={state.isLoadingHistory}
            isSending={state.isSending}
            onSelectRecentSession={(selectedSessionId) => {
              void selectRecentSession(selectedSessionId);
            }}
            onStartNewConversation={startNewConversation}
            recentSessions={state.recentSessions}
            sessionId={state.sessionId}
            transcriptLabel={transcriptLabel}
          />
          <ChatMessages
            isLoadingHistory={state.isLoadingHistory}
            isSending={state.isSending}
            messages={state.messages}
            messagesEndRef={messagesEndRef}
            onExampleSelect={(example) => {
              dispatch({ type: "inputChanged", input: example });
            }}
          />
          <ChatComposer
            canSend={canSend}
            error={state.error}
            input={state.input}
            isLoadingHistory={state.isLoadingHistory}
            isSending={state.isSending}
            onInputChange={(nextInput) => {
              dispatch({ type: "inputChanged", input: nextInput });
            }}
            onSend={(messageText) => {
              void sendMessage(messageText);
            }}
            quota={state.quota}
            remainingChars={remainingChars}
          />
        </section>
      </section>
    </main>
  );
}
