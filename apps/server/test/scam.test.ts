import { describe, expect, it } from "vitest";
import { scoreScamRules } from "../src/packs/kaiseho/scam/rules";

describe("scam rules", () => {
  it("flags the digital-arrest demo script as likely scam", () => {
    const r = scoreScamRules("A CBI officer called. He said my Aadhaar is in a money laundering case and I must stay on video call and not tell anyone.");
    expect(r.verdict).toBe("likely_scam");
    expect(r.pattern).toBe("digital_arrest");
    expect(r.score).toBeGreaterThanOrEqual(0.85);
  });

  it("works in Hindi", () => {
    const r = scoreScamRules("सीबीआई से फ़ोन आया, बोले गिरफ्तार करेंगे, वीडियो कॉल पर रहो और किसी को मत बताना");
    expect(r.verdict).toBe("likely_scam");
    expect(r.pattern).toBe("digital_arrest");
  });

  it("works in Kannada", () => {
    const r = scoreScamRules("ಸಿಬಿಐ ಪೊಲೀಸ್ ಕರೆ ಮಾಡಿದರು, ಬಂಧನ ಮಾಡುತ್ತೇವೆ, ವಿಡಿಯೋ ಕಾಲ್‌ನಲ್ಲಿ ಇರಿ, ಯಾರಿಗೂ ಹೇಳಬೇಡಿ ಅಂದರು");
    expect(r.verdict).toBe("likely_scam");
  });

  it("catches KYC, lottery and remote-access scams", () => {
    expect(scoreScamRules("Bank said my KYC expired and account will be blocked today, click the link").verdict).toBe("likely_scam");
    expect(scoreScamRules("I won a KBC lottery, they want a processing fee").verdict).toBe("likely_scam");
    expect(scoreScamRules("He asked me to install AnyDesk and share my screen").verdict).toBe("likely_scam");
  });

  it("does not flag normal life", () => {
    for (const s of [
      "Ravi called yesterday, he will visit on Sunday",
      "The courier delivered my medicines from the pharmacy",
      "The clinic called to remind me of Thursday's appointment",
      "Kamala and I watched the serial together",
    ]) {
      expect(scoreScamRules(s).verdict, s).toBe("probably_safe");
    }
  });
});
