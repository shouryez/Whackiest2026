import type { Lang, ScamPattern } from "@kaiseho/shared";

/**
 * Calm, correct, pre-written advice per pattern (plan.md Section 10.3), so the voice agent
 * gets a ready line instead of improvising. Hindi and Kannada lines need a native speaker's polish.
 * Kept short: the agent paraphrases them in conversation.
 */
type AdviceTable = Record<Lang, Partial<Record<ScamPattern, string>> & { default: string }>;

export const ADVICE: AdviceTable = {
  en: {
    default: "This sounds like a scam. Don't send money or share any numbers or OTP. Just hang up if they call again. Cyber helpline is 1930.",
    digital_arrest: "This is a scam. Real police or CBI never arrest anyone on a phone or video call and never ask for money. Don't send money, don't share numbers, hang up. Cyber helpline 1930.",
    courier_parcel: "This is a common parcel scam. No courier or customs officer asks for money on the phone. Hang up and don't pay anything.",
    kyc_update: "Banks never block accounts over a phone call or ask you to click links. Don't click anything or share numbers. Visit the branch if worried.",
    electricity_cut: "Electricity offices don't call to cut power tonight. It's a scam. Don't call their number or pay. Check the bill with family.",
    relative_emergency: "Please don't send money. Call the family member yourself on their usual number first. Scammers pretend to be relatives in trouble.",
    lottery_prize: "There is no prize. Real prizes never ask for a fee. Don't pay anything and don't share numbers.",
    safe_account: "There is no RBI safe account. Never transfer money to verify anything. It's a scam.",
    remote_access: "Please don't install any app or share your screen for a stranger. They can take your money that way. Hang up.",
    otp_request: "Never tell anyone your OTP or PIN, not even someone from the bank. Hang up.",
    investment_scheme: "Nobody can guarantee double money. It's a scam. Please talk to your family before investing anything.",
  },
  hi: {
    default: "यह धोखा लग रहा है। पैसे मत भेजिए, कोई नंबर या ओटीपी मत बताइए। दोबारा फ़ोन आए तो काट दीजिए। साइबर हेल्पलाइन 1930 है।",
    digital_arrest: "यह धोखा है। असली पुलिस या सीबीआई कभी फ़ोन या वीडियो कॉल पर गिरफ़्तार नहीं करती और पैसे नहीं माँगती। पैसे मत भेजिए, फ़ोन काट दीजिए। हेल्पलाइन 1930।",
    courier_parcel: "यह पार्सल वाला धोखा है। कोई कूरियर या कस्टम अधिकारी फ़ोन पर पैसे नहीं माँगता। फ़ोन काट दीजिए।",
    kyc_update: "बैंक फ़ोन पर खाता बंद नहीं करता और लिंक पर क्लिक नहीं करवाता। कुछ मत दबाइए, कोई नंबर मत बताइए।",
    electricity_cut: "बिजली विभाग आज रात बिजली काटने के लिए फ़ोन नहीं करता। यह धोखा है। पैसे मत भेजिए।",
    relative_emergency: "पैसे मत भेजिए। पहले घर वाले को उनके पुराने नंबर पर ख़ुद फ़ोन कीजिए।",
    lottery_prize: "कोई इनाम नहीं है। असली इनाम के लिए कभी फ़ीस नहीं लगती। कुछ मत भेजिए।",
    safe_account: "आरबीआई का कोई 'सेफ़ अकाउंट' नहीं होता। जाँच के लिए कभी पैसे ट्रांसफ़र मत कीजिए।",
    remote_access: "किसी अनजान के कहने पर कोई ऐप मत डालिए और स्क्रीन मत दिखाइए। फ़ोन काट दीजिए।",
    otp_request: "अपना ओटीपी या पिन किसी को मत बताइए, बैंक वाले को भी नहीं।",
    investment_scheme: "कोई पैसे दुगने की गारंटी नहीं दे सकता। यह धोखा है। पहले परिवार से बात कीजिए।",
  },
  kn: {
    default: "ಇದು ಮೋಸದ ಕರೆ ಅನ್ನಿಸುತ್ತದೆ. ಹಣ ಕಳುಹಿಸಬೇಡಿ, ಯಾವುದೇ ನಂಬರ್ ಅಥವಾ ಒಟಿಪಿ ಹೇಳಬೇಡಿ. ಮತ್ತೆ ಕರೆ ಬಂದರೆ ಕಟ್ ಮಾಡಿ. ಸೈಬರ್ ಸಹಾಯವಾಣಿ 1930.",
    digital_arrest: "ಇದು ಮೋಸ. ನಿಜವಾದ ಪೊಲೀಸ್ ಅಥವಾ ಸಿಬಿಐ ಫೋನ್ ಅಥವಾ ವಿಡಿಯೋ ಕಾಲ್‌ನಲ್ಲಿ ಯಾರನ್ನೂ ಬಂಧಿಸುವುದಿಲ್ಲ, ಹಣ ಕೇಳುವುದಿಲ್ಲ. ಹಣ ಕಳುಹಿಸಬೇಡಿ, ಕರೆ ಕಟ್ ಮಾಡಿ. ಸಹಾಯವಾಣಿ 1930.",
    courier_parcel: "ಇದು ಪಾರ್ಸೆಲ್ ಮೋಸ. ಯಾವ ಕೊರಿಯರ್ ಅಥವಾ ಕಸ್ಟಮ್ಸ್ ಅಧಿಕಾರಿಯೂ ಫೋನ್‌ನಲ್ಲಿ ಹಣ ಕೇಳುವುದಿಲ್ಲ. ಕರೆ ಕಟ್ ಮಾಡಿ.",
    kyc_update: "ಬ್ಯಾಂಕ್ ಫೋನ್‌ನಲ್ಲಿ ಖಾತೆ ಬ್ಲಾಕ್ ಮಾಡುವುದಿಲ್ಲ, ಲಿಂಕ್ ಒತ್ತಲು ಹೇಳುವುದಿಲ್ಲ. ಏನನ್ನೂ ಒತ್ತಬೇಡಿ, ನಂಬರ್ ಹೇಳಬೇಡಿ.",
    electricity_cut: "ವಿದ್ಯುತ್ ಕಚೇರಿ ಇಂದು ರಾತ್ರಿ ಕರೆಂಟ್ ಕಟ್ ಮಾಡುತ್ತೇವೆ ಎಂದು ಕರೆ ಮಾಡುವುದಿಲ್ಲ. ಇದು ಮೋಸ. ಹಣ ಕೊಡಬೇಡಿ.",
    relative_emergency: "ಹಣ ಕಳುಹಿಸಬೇಡಿ. ಮೊದಲು ಮನೆಯವರಿಗೆ ಅವರ ಹಳೆಯ ನಂಬರ್‌ಗೆ ನೀವೇ ಕರೆ ಮಾಡಿ.",
    lottery_prize: "ಯಾವ ಬಹುಮಾನವೂ ಇಲ್ಲ. ನಿಜವಾದ ಬಹುಮಾನಕ್ಕೆ ಶುಲ್ಕ ಕೇಳುವುದಿಲ್ಲ. ಏನನ್ನೂ ಕೊಡಬೇಡಿ.",
    safe_account: "ಆರ್‌ಬಿಐ 'ಸೇಫ್ ಅಕೌಂಟ್' ಎಂಬುದೇ ಇಲ್ಲ. ಪರಿಶೀಲನೆಗೆ ಹಣ ವರ್ಗಾಯಿಸಬೇಡಿ.",
    remote_access: "ಅಪರಿಚಿತರು ಹೇಳಿದರೆ ಯಾವುದೇ ಆ್ಯಪ್ ಹಾಕಬೇಡಿ, ಸ್ಕ್ರೀನ್ ತೋರಿಸಬೇಡಿ. ಕರೆ ಕಟ್ ಮಾಡಿ.",
    otp_request: "ನಿಮ್ಮ ಒಟಿಪಿ ಅಥವಾ ಪಿನ್ ಯಾರಿಗೂ ಹೇಳಬೇಡಿ, ಬ್ಯಾಂಕ್‌ನವರಿಗೂ ಸಹ.",
    investment_scheme: "ಹಣ ಡಬಲ್ ಮಾಡುವ ಭರವಸೆ ಯಾರೂ ಕೊಡಲಾರರು. ಇದು ಮೋಸ. ಮೊದಲು ಮನೆಯವರ ಜೊತೆ ಮಾತಾಡಿ.",
  },
};

export function adviceFor(pattern: ScamPattern, lang: Lang): string {
  const table = ADVICE[lang] ?? ADVICE.en;
  return table[pattern] ?? table.default;
}
