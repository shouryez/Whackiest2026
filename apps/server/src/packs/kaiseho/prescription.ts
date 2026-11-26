import { z } from "zod";
import type { Slot } from "@kaiseho/shared";
import { llmEnabled, llmVisionJson, type ImageInput } from "../../engine/llm";

/**
 * Prescription photo → medicine schedule (plan.md P2-2).
 * The photo is processed in memory and never stored. The result is a DRAFT: the family
 * confirms every row before anything is saved (never auto-save). KaiseHo never changes doses.
 *
 * Indian prescriptions use shorthand the model may copy verbatim; we decode it
 * deterministically: "1-0-1", "1-1-1", "0-0-1", "OD", "BD", "TDS/TID", "QID", "HS", "SOS", "AC/PC".
 */
const SLOT_ORDER: Slot[] = ["morning", "afternoon", "night"];

export function decodeFrequency(raw: string): { slots: Slot[]; asNeeded: boolean; withFood?: "before" | "after" } {
  const t = raw.toLowerCase().replace(/\s+/g, " ").trim();
  const withFood = /\b(ac|before food|before meals?|empty stomach|khali pet)\b/.test(t) ? "before" : /\b(pc|after food|after meals?|khane ke baad)\b/.test(t) ? "after" : undefined;
  const asNeeded = /\b(sos|prn|as needed|when needed|if needed)\b/.test(t);

  // 1-0-1, 1–1–1, ½-0-1, 1-0-0-1 (4-slot: morning-afternoon-evening-night)
  const m = t.match(/(?<![\d.])([01½]|0?\.5)\s*[-–x]\s*([01½]|0?\.5)\s*[-–x]\s*([01½]|0?\.5)(?:\s*[-–x]\s*([01½]|0?\.5))?(?![\d.])/);
  if (m) {
    const parts = m.slice(1).filter((x) => x !== undefined) as string[];
    const order: Slot[] = parts.length === 4 ? ["morning", "afternoon", "evening", "night"] : SLOT_ORDER;
    return { slots: order.filter((_, i) => parts[i] !== "0"), asNeeded, withFood };
  }
  if (/\b(hs|at bedtime|bedtime|night only|raat ko)\b/.test(t)) return { slots: ["night"], asNeeded, withFood };
  if (/\b(qid|four times)\b/.test(t)) return { slots: ["morning", "afternoon", "evening", "night"], asNeeded, withFood };
  if (/\b(tds|tid|thrice|three times)\b/.test(t)) return { slots: ["morning", "afternoon", "night"], asNeeded, withFood };
  if (/\b(bd|bid|twice|two times)\b/.test(t)) return { slots: ["morning", "night"], asNeeded, withFood };
  if (/\b(od|once( a day| daily)?|daily)\b/.test(t)) return { slots: [/night|evening|dinner/.test(t) ? "night" : "morning"], asNeeded, withFood };
  return { slots: asNeeded ? [] : ["morning"], asNeeded, withFood };
}

const ExtractSchema = z.object({
  medicines: z.array(z.object({
    name: z.string(),
    dose: z.string().default(""),
    frequency_text: z.string().default(""),
    slots: z.array(z.string()).default([]).transform((xs) => xs.map((x) => x.toLowerCase()).filter((x): x is Slot => ["morning", "afternoon", "evening", "night"].includes(x))),
    with_food: z.string().optional().transform((v) => (v && /before|empty|ac/i.test(v) ? "before" : v && /after|pc/i.test(v) ? "after" : undefined) as "before" | "after" | undefined),
    duration: z.string().optional(),
    confidence: z.coerce.number().min(0).max(1).catch(0.5).default(0.5),
  })).max(15),
  doctor: z.string().optional(),
  date: z.string().optional(),
  unreadable: z.array(z.string()).max(10).default([]),
});

export interface DraftMedicine { name: string; dose: string; slots: Slot[]; withFood?: "before" | "after" | "any"; duration?: string; frequencyText: string; asNeeded: boolean; confidence: number; needsReview: boolean }

const SYSTEM = `You read a photo of an Indian doctor's prescription and list the medicines.
For each medicine give: name (brand or generic as written), dose (e.g. "500 mg"), frequency_text EXACTLY as written (e.g. "1-0-1", "BD", "HS", "SOS"),
slots (morning/afternoon/evening/night), with_food (before/after/any) if written, duration if written, confidence 0-1.
Never guess a dose or invent a medicine: if a line is unreadable put it in "unreadable". Do not give medical advice.
JSON: {medicines:[...], doctor?, date?, unreadable:[]}`;

export class PrescriptionError extends Error {
  constructor(message: string, public status: 400 | 413 | 503 | 422) { super(message); }
}

export function parseImage(dataUrlOrBase64: string, mediaType?: string): ImageInput {
  const m = dataUrlOrBase64.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  const type = (m?.[1] ?? mediaType) as ImageInput["mediaType"] | undefined;
  const base64 = m?.[2] ?? dataUrlOrBase64;
  if (!type || !["image/jpeg", "image/png", "image/webp"].includes(type)) throw new PrescriptionError("Upload a JPG, PNG or WebP photo", 400);
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > 5 * 1024 * 1024) throw new PrescriptionError("Photo is too large (max 5 MB)", 413);
  return { mediaType: type, base64 };
}

export async function readPrescription(image: ImageInput): Promise<{ medicines: DraftMedicine[]; doctor?: string; date?: string; unreadable: string[] }> {
  if (!llmEnabled()) throw new PrescriptionError("Prescription reading needs an AI key (set LLM_PROVIDER + GEMINI_API_KEY, ANTHROPIC_API_KEY or Bedrock). You can still add medicines by hand.", 503);
  const out = (await llmVisionJson({ system: SYSTEM, user: "Read this prescription.", image, schema: ExtractSchema })) as z.output<typeof ExtractSchema> | null;
  if (!out) throw new PrescriptionError("Couldn't read this photo. Try a clearer, well-lit photo, or add medicines by hand.", 422);
  return {
    doctor: out.doctor, date: out.date, unreadable: out.unreadable,
    medicines: out.medicines.map((m) => {
      const decoded = decodeFrequency(m.frequency_text);
      // Deterministic shorthand decoding wins over the model's guess when the shorthand is recognisable.
      const slots = m.frequency_text && (decoded.slots.length || decoded.asNeeded) ? decoded.slots : m.slots;
      return {
        name: m.name.trim(), dose: m.dose.trim(), slots, withFood: m.with_food ?? decoded.withFood, duration: m.duration,
        frequencyText: m.frequency_text, asNeeded: decoded.asNeeded, confidence: m.confidence,
        needsReview: m.confidence < 0.7 || !m.dose || slots.length === 0,
      };
    }),
  };
}
