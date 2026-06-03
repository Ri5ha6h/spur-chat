import { CHAT_SESSION_STORAGE_KEY } from "@spur/shared";
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

describe("ChatPanel", () => {
  it("renders the empty chat state", async () => {
    render(<ChatPanel />);

    expect(await screen.findByText("Start with a real support question")).toBeInTheDocument();
  });

  it("restores localStorage session history", async () => {
    localStorage.setItem(
      CHAT_SESSION_STORAGE_KEY,
      "00000000-0000-4000-8000-000000000123",
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
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

    render(<ChatPanel />);

    expect(await screen.findByText("hello")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/chat/history/00000000-0000-4000-8000-000000000123",
    );
  });

  it("sends a message with the button", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        reply: "Returns are accepted for 30 days.",
        sessionId: "00000000-0000-4000-8000-000000000123",
      }),
    );

    render(<ChatPanel />);

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "What is your return policy?" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));

    expect(await screen.findByText("What is your return policy?")).toBeInTheDocument();
    expect(await screen.findByText("Returns are accepted for 30 days.")).toBeInTheDocument();
  });

  it("sends a message with Enter", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        reply: "Yes, we ship to the USA.",
        sessionId: "00000000-0000-4000-8000-000000000123",
      }),
    );

    render(<ChatPanel />);

    const input = screen.getByLabelText("Message");
    fireEvent.change(input, { target: { value: "Do you ship to USA?" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText("Yes, we ship to the USA.")).toBeInTheDocument();
  });

  it("shows pending state while sending", async () => {
    let resolveResponse: (response: Response) => void = () => undefined;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveResponse = resolve;
      }),
    );

    render(<ChatPanel />);

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "hello" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));

    expect(screen.getByText("Agent is typing")).toBeInTheDocument();
    expect(screen.getByLabelText("Send message")).toBeDisabled();

    resolveResponse(
      jsonResponse({
        reply: "Hello.",
        sessionId: "00000000-0000-4000-8000-000000000123",
      }),
    );

    expect(await screen.findByText("Hello.")).toBeInTheDocument();
  });

  it("displays API errors without losing the transcript", async () => {
    fetchMock.mockResolvedValueOnce(
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
