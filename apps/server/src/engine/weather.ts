/**
 * Open-Meteo (free, no key) current weather for the elder's city, cached 1 h (plan.md P2-8).
 * Returns "" on any failure: the call must never wait on weather.
 */
const cache = new Map<string, { at: number; note: string }>();

const WMO: Record<number, string> = {
  0: "clear sky", 1: "mostly clear", 2: "partly cloudy", 3: "cloudy", 45: "foggy", 48: "foggy",
  51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 61: "light rain", 63: "rain", 65: "heavy rain",
  80: "rain showers", 81: "rain showers", 82: "heavy showers", 95: "thunderstorms", 96: "thunderstorms", 99: "thunderstorms",
};

export async function weatherNote(city: string, lat?: number, lon?: number): Promise<string> {
  if (lat === undefined || lon === undefined || process.env.VITEST) return ""; // tests never touch the network
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 3600_000) return hit.note;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max&timezone=auto&forecast_days=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return "";
    const j = (await res.json()) as { current?: { temperature_2m: number; weather_code: number }; daily?: { temperature_2m_max: number[] } };
    const t = Math.round(j.current?.temperature_2m ?? NaN);
    const max = Math.round(j.daily?.temperature_2m_max?.[0] ?? NaN);
    if (Number.isNaN(t)) return "";
    const sky = WMO[j.current?.weather_code ?? -1] ?? "";
    let note = `${sky ? sky[0].toUpperCase() + sky.slice(1) + ", " : ""}${t}°C now in ${city}`;
    if (!Number.isNaN(max)) note += `, up to ${max}°C today`;
    if (max >= 37) note += ". Very hot: remind her to drink water and stay in after noon";
    cache.set(key, { at: Date.now(), note });
    return note;
  } catch {
    return "";
  }
}
