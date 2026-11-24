"use client";
import type { Alert, LiveEvent } from "@kaiseho/shared";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
const TOKEN = process.env.NEXT_PUBLIC_FAMILY_TOKEN ?? "dev-family-token";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json() as Promise<T>;
}

export interface TodayView {
  date: string;
  elder: { elderId: string; name: string; preferredName: string; age?: number; city: string; languages: string[]; callTimeLocal: string; status: string };
  meds: { medId: string; name: string; slot: string; status: "taken" | "missed" | "unsure" | "pending" }[];
  wellbeing: { mood?: number; sleep?: string; pain?: { where: string; level: number }; energy?: number; appetite?: string } | null;
  trend: { date: string; mood: number | null; pain: number | null }[];
  adherence14d: number | null;
  followUps: string[];
  privateCount: number;
}

export interface Overview {
  family: { familyId: string; name: string };
  members: { name: string; relation: string; role: string; telegramLinked: boolean }[];
  elders: TodayView[];
  alerts: Alert[];
}

export type { Alert, LiveEvent };
