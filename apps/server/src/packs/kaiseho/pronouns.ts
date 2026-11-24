import type { Elder } from "@kaiseho/shared";

/** she/he/they from the elder's profile (never guessed from a name). */
export function pr(elder: Pick<Elder, "gender">) {
  if (elder.gender === "female") return { she: "she", her: "her", hers: "her", She: "She", Her: "Her" };
  if (elder.gender === "male") return { she: "he", her: "him", hers: "his", She: "He", Her: "His" };
  return { she: "they", her: "them", hers: "their", She: "They", Her: "Their" };
}
