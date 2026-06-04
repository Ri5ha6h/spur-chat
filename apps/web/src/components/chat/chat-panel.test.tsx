import {
  CHAT_SESSION_STORAGE_KEY,
  LEGACY_CHAT_SESSION_STORAGE_KEY,
} from "@spur/shared";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "./chat-panel";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation((input) => {
    const url = String(input);

    if (url.endsWith("/chat/quota")) {
      return Promise.resolve(
        jsonResponse({
          dailyTokenLimit: 15000,
          dailyTokensRemaining: 14950,
          messagesPerMinute: 8,
          messagesRemaining: 8,
        }),
      );
    }

    return Promise.resolve(jsonResponse({ conversations: [] }));
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function activeSession() {
  const value = localStorage.getItem(CHAT_SESSION_STORAGE_KEY);
  return value ? JSON.parse(value) : undefined;
}

describe("ChatPanel", () => {
  it("renders the empty chat state", async () => {
    render(<ChatPanel />);

    expect(screen.getByText("Spur AI Support Agent")).toBeInTheDocument();
    expect(screen.queryByText("AI support agent")).not.toBeInTheDocument();
    expect(await screen.findByText("Start with a real support question")).toBeInTheDocument();
  });

  it("shows message and token quota in the footer", async () => {
    render(<ChatPanel />);

    expect(await screen.findByText("8/8 messages left")).toBeInTheDocument();
    expect(screen.getByText("14,950/15,000 tokens left")).toBeInTheDocument();
  });

  it("restores localStorage session history", async () => {
    localStorage.setItem(
      CHAT_SESSION_STORAGE_KEY,
      JSON.stringify({
        sessionId: "00000000-0000-4000-8000-000000000123",
        conversationName: "Saved chat",
      }),
    );
    fetchMock.mockImplementation((input) => {
      const url = String(input);

      if (url.endsWith("/chat/recent")) {
        return Promise.resolve(jsonResponse({ conversations: [] }));
      }

      return Promise.resolve(
        jsonResponse({
          conversationName: "Saved chat",
          sessionId: "00000000-0000-4000-8000-000000000123",
          messages: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              sender: "user",
              text: "hello",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
      );
    });

    render(<ChatPanel />);

    expect(await screen.findByText("hello")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/chat/history/00000000-0000-4000-8000-000000000123",
    );
    expect(
      screen.queryByText("00000000-0000-4000-8000-000000000123"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Saved chat")).toBeInTheDocument();
  });

  it("migrates a legacy localStorage session id", async () => {
    localStorage.setItem(
      LEGACY_CHAT_SESSION_STORAGE_KEY,
      "00000000-0000-4000-8000-000000000123",
    );
    fetchMock.mockImplementation((input) => {
      const url = String(input);

      if (url.endsWith("/chat/recent")) {
        return Promise.resolve(jsonResponse({ conversations: [] }));
      }

      return Promise.resolve(
        jsonResponse({
          conversationName: "Migrated chat",
          sessionId: "00000000-0000-4000-8000-000000000123",
          messages: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              sender: "user",
              text: "hello",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
      );
    });

    render(<ChatPanel />);

    expect(await screen.findByText("hello")).toBeInTheDocument();
    expect(activeSession()).toEqual({
      sessionId: "00000000-0000-4000-8000-000000000123",
      conversationName: "Migrated chat",
    });
    expect(localStorage.getItem(LEGACY_CHAT_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("sends a message with the button", async () => {
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);

      if (url.endsWith("/chat/recent")) {
        return Promise.resolve(jsonResponse({ conversations: [] }));
      }

      if (init?.method === "POST") {
        return Promise.resolve(
          jsonResponse({
            conversationName: "Chat 1",
            reply: "Returns are accepted for 30 days.",
            sessionId: "00000000-0000-4000-8000-000000000123",
          }),
        );
      }

      return Promise.resolve(jsonResponse({ conversations: [] }));
    });

    render(<ChatPanel />);

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "What is your return policy?" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));

    expect(await screen.findByText("What is your return policy?")).toBeInTheDocument();
    expect(await screen.findByText("Returns are accepted for 30 days.")).toBeInTheDocument();
    expect(activeSession()).toEqual({
      sessionId: "00000000-0000-4000-8000-000000000123",
      conversationName: "Chat 1",
    });
  });

  it("starts a new chat without deleting recent chat names", async () => {
    localStorage.setItem(
      CHAT_SESSION_STORAGE_KEY,
      JSON.stringify({
        sessionId: "00000000-0000-4000-8000-000000000123",
        conversationName: "Return policy question",
      }),
    );
    fetchMock.mockImplementation((input) => {
      const url = String(input);

      if (url.endsWith("/chat/recent")) {
        return Promise.resolve(
          jsonResponse({
            conversations: [
              {
                sessionId: "00000000-0000-4000-8000-000000000123",
                conversationName: "Return policy question",
                updatedAt: "2026-01-01T00:00:00.000Z",
              },
            ],
          }),
        );
      }

      return Promise.resolve(
        jsonResponse({
          conversationName: "Return policy question",
          sessionId: "00000000-0000-4000-8000-000000000123",
          messages: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              sender: "user",
              text: "hello",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
      );
    });

    render(<ChatPanel />);

    expect(await screen.findByText("hello")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Start new chat"));

    expect(localStorage.getItem(CHAT_SESSION_STORAGE_KEY)).toBeNull();
    expect(screen.queryByText("hello")).not.toBeInTheDocument();
    expect(screen.getByText("Return policy question")).toBeInTheDocument();
  });

  it("loads a recent chat by name", async () => {
    fetchMock.mockImplementation((input) => {
      const url = String(input);

      if (url.endsWith("/chat/recent")) {
        return Promise.resolve(
          jsonResponse({
            conversations: [
              {
                sessionId: "00000000-0000-4000-8000-000000000123",
                conversationName: "Damaged delivery",
                updatedAt: "2026-01-01T00:00:00.000Z",
              },
            ],
          }),
        );
      }

      return Promise.resolve(
        jsonResponse({
          conversationName: "Damaged delivery",
          sessionId: "00000000-0000-4000-8000-000000000123",
          messages: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              sender: "user",
              text: "My item arrived damaged.",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
      );
    });

    render(<ChatPanel />);

    expect(await screen.findByText("Damaged delivery")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Recent chats"), {
      target: { value: "00000000-0000-4000-8000-000000000123" },
    });

    expect(await screen.findByText("My item arrived damaged.")).toBeInTheDocument();
    expect(activeSession()).toEqual({
      sessionId: "00000000-0000-4000-8000-000000000123",
      conversationName: "Damaged delivery",
    });
    expect(screen.getAllByText("Damaged delivery").length).toBeGreaterThan(0);
  });

  it("sends a message with Enter", async () => {
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);

      if (url.endsWith("/chat/recent")) {
        return Promise.resolve(jsonResponse({ conversations: [] }));
      }

      if (init?.method === "POST") {
        return Promise.resolve(
          jsonResponse({
            conversationName: "Chat 1",
            reply: "Yes, we ship to the USA.",
            sessionId: "00000000-0000-4000-8000-000000000123",
          }),
        );
      }

      return Promise.resolve(jsonResponse({ conversations: [] }));
    });

    render(<ChatPanel />);

    const input = screen.getByLabelText("Message");
    fireEvent.change(input, { target: { value: "Do you ship to USA?" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText("Yes, we ship to the USA.")).toBeInTheDocument();
  });

  it("shows pending state while sending", async () => {
    let resolveResponse: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);

      if (url.endsWith("/chat/recent")) {
        return Promise.resolve(jsonResponse({ conversations: [] }));
      }

      if (init?.method === "POST") {
        return new Promise((resolve) => {
          resolveResponse = resolve;
        });
      }

      return Promise.resolve(jsonResponse({ conversations: [] }));
    });

    render(<ChatPanel />);

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "hello" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));

    expect(screen.getByText("Agent is typing")).toBeInTheDocument();
    expect(screen.getByLabelText("Send message")).toBeDisabled();

    resolveResponse(
      jsonResponse({
        conversationName: "Chat 1",
        reply: "Hello.",
        sessionId: "00000000-0000-4000-8000-000000000123",
      }),
    );

    expect(await screen.findByText("Hello.")).toBeInTheDocument();
  });

  it("displays API errors without losing the transcript", async () => {
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);

      if (url.endsWith("/chat/recent")) {
        return Promise.resolve(jsonResponse({ conversations: [] }));
      }

      if (init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(
            {
              error: {
                code: "validation_error",
                message: "Message must be 2000 characters or fewer.",
              },
            },
            { status: 400 },
          ),
        );
      }

      return Promise.resolve(jsonResponse({ conversations: [] }));
    });

    render(<ChatPanel />);

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "hello" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));

    expect(await screen.findByText("hello")).toBeInTheDocument();
    expect(
      await screen.findByText("Message must be 2000 characters or fewer."),
    ).toBeInTheDocument();

    await waitFor(() => expect(screen.getByLabelText("Message")).not.toBeDisabled());
  });
});
