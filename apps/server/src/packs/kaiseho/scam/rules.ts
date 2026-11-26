import type { ScamPattern, ScamVerdict } from "@kaiseho/shared";

/**
 * Scam Shield, layer 1: deterministic rules (plan.md Section 10.3). Runs in well under 5 ms.
 * Weighted keyword families per pattern in English, Hindi (Devanagari + romanised) and Kannada,
 * plus four "meta" signals: authority, secrecy, urgency, money.
 * Secrecy + urgency + authority + money ⇒ near-certain scam (≥ 0.9).
 */

type Signal = [keyword: string, weight: number];

const PATTERNS: Record<Exclude<ScamPattern, "none">, Signal[]> = {
  digital_arrest: [
    ["digital arrest", 0.6], ["cbi", 0.35], ["enforcement directorate", 0.35], ["ed officer", 0.35], ["crime branch", 0.3],
    ["narcotics", 0.3], ["ncb", 0.3], ["customs", 0.2], ["police", 0.2], ["arrest", 0.35], ["arrested", 0.35],
    ["arrest warrant", 0.4], ["warrant", 0.25], ["money laundering", 0.4], ["laundering", 0.35], ["video call", 0.3],
    ["stay on the call", 0.3], ["stay on call", 0.3], ["stay on video", 0.35], ["don't tell anyone", 0.25],
    ["do not tell anyone", 0.25], ["aadhaar is misused", 0.35], ["aadhaar misused", 0.35], ["aadhaar", 0.1],
    ["case registered", 0.25], ["fir", 0.2], ["court", 0.15], ["supreme court", 0.3],
    ["सीबीआई", 0.35], ["पुलिस", 0.2], ["गिरफ्तार", 0.35], ["गिरफ़्तार", 0.35], ["मनी लॉन्ड्रिंग", 0.4], ["वीडियो कॉल", 0.3],
    ["किसी को मत बताना", 0.25], ["किसी को मत बताओ", 0.25], ["किसी को नहीं बताना", 0.25], ["आधार", 0.1],
    ["giraftar", 0.35], ["giraftaar", 0.35], ["kisi ko mat batana", 0.25], ["kisiko mat batao", 0.25],
    ["ಸಿಬಿಐ", 0.35], ["ಪೊಲೀಸ್", 0.2], ["ಬಂಧನ", 0.35], ["ಅರೆಸ್ಟ್", 0.35], ["ವಿಡಿಯೋ ಕಾಲ್", 0.3], ["ವೀಡಿಯೊ ಕರೆ", 0.3],
    ["ಯಾರಿಗೂ ಹೇಳಬೇಡಿ", 0.25], ["ಯಾರಿಗೂ ಹೇಳಬೇಡ", 0.25], ["ಆಧಾರ್", 0.1],
  ],
  courier_parcel: [
    ["fedex", 0.35], ["dhl", 0.35], ["courier", 0.25], ["parcel", 0.25], ["package", 0.15], ["drugs", 0.3],
    ["passports", 0.2], ["customs duty", 0.35], ["parcel seized", 0.4], ["package seized", 0.4], ["seized", 0.2],
    ["कूरियर", 0.25], ["पार्सल", 0.25], ["ड्रग्स", 0.3], ["ಕೊರಿಯರ್", 0.25], ["ಪಾರ್ಸೆಲ್", 0.25],
  ],
  kyc_update: [
    ["kyc", 0.4], ["account blocked", 0.35], ["account will be blocked", 0.4], ["will be blocked", 0.3], ["pan link", 0.3],
    ["link your pan", 0.3], ["click the link", 0.35], ["click link", 0.35], ["update today", 0.25], ["sim will be blocked", 0.35],
    ["account block", 0.35], ["block ho jayega", 0.35], ["block ho jaega", 0.35], ["band ho jayega", 0.3], ["khata band", 0.35],
    ["kyc update", 0.4], ["life certificate update", 0.4], ["update your life certificate", 0.4], ["pension will stop", 0.4], ["pension will be stopped", 0.4], ["pension band", 0.4], ["पेंशन बंद", 0.4], ["ಪಿಂಚಣಿ ನಿಲ್ಲ", 0.35], ["खाता बंद", 0.35], ["ब्लॉक हो जाएगा", 0.35], ["बंद हो जाएगा", 0.3], ["केवाईसी", 0.4], ["ಕೆವೈಸಿ", 0.4], ["ಖಾತೆ ಬ್ಲಾಕ್", 0.35],
  ],
  electricity_cut: [
    ["power cut tonight", 0.45], ["electricity will be cut", 0.45], ["electricity cut", 0.4], ["disconnected tonight", 0.4],
    ["electricity", 0.15], ["bill not updated", 0.35], ["bill not paid", 0.3], ["electricity officer", 0.3], ["call this officer", 0.3],
    ["बिजली कट", 0.45], ["बिजली", 0.15], ["bijli", 0.15], ["bijli kat", 0.45], ["ಕರೆಂಟ್ ಕಟ್", 0.45], ["ವಿದ್ಯುತ್", 0.15], ["ಕರೆಂಟ್", 0.1],
  ],
  relative_emergency: [
    ["accident", 0.25], ["in jail", 0.3], ["grandson", 0.15], ["granddaughter", 0.15], ["needs money urgently", 0.45],
    ["need money urgently", 0.45], ["new number", 0.25], ["hospital bill", 0.25], ["send money now", 0.4], ["don't tell his parents", 0.3],
    ["पोता", 0.15], ["एक्सीडेंट", 0.25], ["ಅಪಘಾತ", 0.25], ["ಮೊಮ್ಮಗ", 0.15],
  ],
  lottery_prize: [
    ["lottery", 0.45], ["prize", 0.35], ["you have won", 0.35], ["won", 0.15], ["kbc", 0.45], ["kaun banega crorepati", 0.45],
    ["lucky draw", 0.4], ["gift", 0.15], ["processing fee", 0.4], ["claim fee", 0.4],
    ["लॉटरी", 0.45], ["इनाम", 0.35], ["ಲಾಟರಿ", 0.45], ["ಬಹುಮಾನ", 0.35],
  ],
  safe_account: [
    ["safe account", 0.5], ["rbi account", 0.45], ["rbi", 0.25], ["secure account", 0.4], ["transfer to verify", 0.45],
    ["refund after verification", 0.4], ["verification account", 0.4],
  ],
  remote_access: [
    ["anydesk", 0.5], ["teamviewer", 0.5], ["quick support", 0.4], ["quicksupport", 0.4], ["screen share", 0.4],
    ["share your screen", 0.4], ["share my screen", 0.4], ["screen sharing", 0.4], ["remote app", 0.35], ["install this app", 0.35], ["install an app", 0.35], ["download this app", 0.35],
  ],
  otp_request: [
    ["otp", 0.35], ["otp maanga", 0.5], ["otp manga", 0.5], ["otp mang", 0.5], ["otp maang", 0.5], ["otp puchha", 0.5], ["otp pucha", 0.5],
    ["ओटीपी मांगा", 0.5], ["ओटीपी माँगा", 0.5], ["OTP मांगा", 0.5], ["OTP माँगा", 0.5], ["otp मांगा", 0.5], ["otp माँगा", 0.5], ["ಒಟಿಪಿ ಕೇಳಿದರು", 0.5], ["tell the otp", 0.5], ["tell me the otp", 0.5], ["share the otp", 0.5], ["asked for otp", 0.5], ["otp batao", 0.5], ["share the code", 0.3], ["tell me the code", 0.35], ["ओटीपी बताओ", 0.5], ["ओटीपी बताइए", 0.5], ["ಒಟಿಪಿ ಹೇಳಿ", 0.5], ["pin", 0.15], ["code", 0.1],
    ["ओटीपी", 0.35], ["ಒಟಿಪಿ", 0.35],
  ],
  investment_scheme: [
    ["double your money", 0.5], ["guaranteed return", 0.4], ["guaranteed returns", 0.4], ["crypto", 0.25],
    ["trading tips", 0.3], ["stock tips", 0.3], ["investment", 0.1], ["high returns", 0.3],
  ],
};

const META: Record<"authority" | "secrecy" | "urgency" | "money", string[]> = {
  authority: ["bank", "bank se", "rbi se", "बैंक", "आरबीआई", "cbi", "police", "enforcement directorate", "ed officer", "customs", "rbi", "court", "officer", "government", "inspector",
    "bank manager", "सीबीआई", "पुलिस", "अधिकारी", "ಪೊಲೀಸ್", "ಸಿಬಿಐ", "ಅಧಿಕಾರಿ"],
  secrecy: ["don't tell", "do not tell", "dont tell", "keep it secret", "secret", "mat batana", "mat batao", "किसी को मत", "किसी को नहीं",
    "ಯಾರಿಗೂ ಹೇಳ", "stay on the call", "stay on call", "stay on video", "don't hang up", "do not hang up"],
  urgency: ["block ho jayega", "band ho jayega", "abhi", "jaldi", "immediately", "right now", "today itself", "tonight", "urgent", "urgently", "within an hour", "within 1 hour", "jaldi",
    "turant", "तुरंत", "अभी", "जल्दी", "ಈಗಲೇ", "ತಕ್ಷಣ", "arrest"],
  money: ["money", "transfer", "payment", "pay", "fee", "deposit", "rupees", "lakh", "lakhs", "upi", "paise", "paisa", "पैसे", "पैसा",
    "रुपये", "ಹಣ", "ರುಪಾಯಿ", "otp", "account number", "bank details"],
};

const ESC = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LATIN = /^[\x20-\x7e]+$/;

// Latin keywords match on word boundaries; Indic-script keywords match as substrings
// (Indic words take suffixes, and \b does not work on them).
function compile(k: string): (t: string) => boolean {
  if (LATIN.test(k)) {
    const re = new RegExp(`(?<![a-z0-9])${ESC(k.toLowerCase()).replace(/'/g, "['’]?").replace(/ /g, "\\s+")}(?![a-z0-9])`, "i");
    return (t) => re.test(t);
  }
  return (t) => t.includes(k);
}

const COMPILED = Object.fromEntries(
  Object.entries(PATTERNS).map(([p, sigs]) => [p, sigs.map(([k, w]) => ({ k, w, test: compile(k) }))]),
) as Record<Exclude<ScamPattern, "none">, { k: string; w: number; test: (t: string) => boolean }[]>;
const META_COMPILED = Object.fromEntries(
  Object.entries(META).map(([m, ks]) => [m, ks.map((k) => ({ k, test: compile(k) }))]),
) as Record<keyof typeof META, { k: string; test: (t: string) => boolean }[]>;

const HEARSAY = ["news", "on tv", "television", "newspaper", "heard about", "awareness", "watched a", "read about", "समाचार", "ख़बर", "खबर", "ಸುದ್ದಿ"].map(compile);
const DIRECT = ["called me", "asked me", "told me", "said my", "my aadhaar", "my account", "me to", "mujhe", "मुझे", "मेरा", "ನನಗೆ", "ನನ್ನ"].map(compile);

export interface RuleResult {
  score: number;
  pattern: ScamPattern;
  verdict: ScamVerdict;
  matched: string[];
  meta: string[];
}

export function verdictFor(score: number): ScamVerdict {
  if (score >= 0.6) return "likely_scam";
  if (score >= 0.35) return "possible_scam";
  return "probably_safe";
}

export function scoreScamRules(description: string): RuleResult {
  const text = description.toLowerCase().normalize("NFC");
  let best: { pattern: ScamPattern; score: number; matched: string[] } = { pattern: "none", score: 0, matched: [] };

  for (const [pattern, sigs] of Object.entries(COMPILED) as [Exclude<ScamPattern, "none">, (typeof COMPILED)["otp_request"]][]) {
    const hits = sigs.filter((s) => s.test(text));
    // Longer phrases that contain a shorter matched keyword shouldn't double count: keep max per overlapping family.
    const score = Math.min(1, hits.reduce((a, s) => a + s.w, 0));
    if (score > best.score) best = { pattern, score, matched: hits.map((h) => h.k) };
  }

  const meta = (Object.keys(META_COMPILED) as (keyof typeof META)[]).filter((m) => META_COMPILED[m].some((s) => s.test(text)));
  let score = best.score;
  if (meta.length >= 3) score = Math.max(score, 0.9 + 0.03 * (meta.length - 3));
  // Anyone claiming authority (bank, RBI, police) who asks for an OTP is a scam, full stop.
  if (meta.includes("authority") && (best.pattern === "otp_request" || COMPILED.otp_request.some((s) => s.w >= 0.35 && s.test(text)))) {
    score = Math.max(score, 0.8);
    if (best.pattern === "none" || best.score < 0.5) best = { ...best, pattern: "otp_request" };
  }
  else if (meta.length === 2 && best.score > 0) score = score + 0.15;
  // Second-hand mentions ("I saw a news story about digital arrest scams") are not an attempt on her.
  const hearsay = HEARSAY.some((h) => h(text));
  const direct = DIRECT.some((d) => d(text));
  if (hearsay && !direct) score *= 0.5;
  score = Math.round(Math.min(0.99, score) * 100) / 100;

  return { score, pattern: score > 0 ? best.pattern : "none", verdict: verdictFor(score), matched: best.matched, meta };
}
