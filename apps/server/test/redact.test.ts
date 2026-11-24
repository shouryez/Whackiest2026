import { describe, expect, it } from "vitest";
import { redactDeep, redactPII } from "../src/control/redact";

describe("redactPII", () => {
  const cases: [string, string, string][] = [
    ["OTP en", "He asked me to tell the OTP 482913.", "[REDACTED:otp]"],
    ["OTP digits before keyword", "I told him 4829 was the code", "[REDACTED:otp]"],
    ["OTP Hindi", "उसने ओटीपी 556677 माँगा", "[REDACTED:otp]"],
    ["OTP Kannada", "ಅವರು ಒಟಿಪಿ 1234 ಕೇಳಿದರು", "[REDACTED:otp]"],
    ["Aadhaar spaced", "My Aadhaar is 1234 5678 9012", "[REDACTED:aadhaar]"],
    ["Aadhaar plain", "aadhaar 123456789012", "[REDACTED:aadhaar]"],
    ["PAN", "PAN is ABCDE1234F", "[REDACTED:pan]"],
    ["card", "card 4111 1111 1111 1111 expiry", "[REDACTED:card]"],
    ["bank account", "my account number is 50100123456789", "[REDACTED:bank_account]"],
    ["account Hindi", "खाता 123456789012345 है", "[REDACTED:bank_account]"],
    ["IFSC", "IFSC HDFC0001234", "[REDACTED:ifsc]"],
  ];
  for (const [name, input, expected] of cases) {
    it(`redacts ${name}`, () => {
      const out = redactPII(input);
      expect(out).toContain(expected);
      expect(out).not.toMatch(/\d{4,}/);
    });
  }

  it("leaves ordinary numbers alone", () => {
    expect(redactPII("Knee pain 3 out of 10, took 2 tablets at 9 PM, 33°C")).toBe("Knee pain 3 out of 10, took 2 tablets at 9 PM, 33°C");
    expect(redactPII("Metformin 500 mg")).toBe("Metformin 500 mg");
  });

  it("does not touch our ids", () => {
    const out = redactDeep({ call_id: "call_sim_1795538410739", callId: "call_1795538410739", note: "otp 9999" });
    expect(out.call_id).toBe("call_sim_1795538410739");
    expect(out.callId).toBe("call_1795538410739");
    expect(out.note).toBe("otp [REDACTED:otp]");
  });
});
