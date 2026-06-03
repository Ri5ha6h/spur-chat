import { describe, expect, it } from "vitest";
import { sendMessageRequestSchema } from "./index.js";

describe("sendMessageRequestSchema", () => {
  it("trims valid messages", () => {
    expect(sendMessageRequestSchema.parse({ message: "  hello  " })).toEqual({
      message: "hello",
    });
  });

  it("rejects empty messages", () => {
    expect(() => sendMessageRequestSchema.parse({ message: "   " })).toThrow();
  });

  it("rejects very long messages", () => {
    expect(() =>
      sendMessageRequestSchema.parse({ message: "a".repeat(2001) }),
    ).toThrow();
  });
});
