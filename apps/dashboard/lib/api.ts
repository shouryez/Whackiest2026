"use client";
import type { Alert, CallSummary, LiveEvent, Memory, Message, Nudge } from "@kaiseho/shared";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
export const TOKEN = process.env.NEXT_PUBLIC_FAMILY_TOKEN ?? "dev-family-token";
export const ELDER_ID = "eld_lakshmi";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `${res.status}`);
  }
  return res.json() as Promise<T>;
}
export const post = <T = unknown>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });

export type MedStatus = "taken" | "missed" | "unsure" | "pending";
export interface TodayView {
  date: string;
  elder: { elderId: string; name: string; preferredName: string; age?: number; city: string; languages: string[]; callTimeLocal: string; status: string; privacy: { shareMedicines: boolean; shareWellbeing: boolean; shareMemories: boolean } };
  meds: { medId: string; name: string; slot: string; status: MedStatus }[];
  wellbeing: { mood?: number; sleep?: string; pain?: { where: string; level: number }; energy?: number; appetite?: string } | null;
  trend: { date: string; mood: number | null; pain: number | null }[];
  adherence14d: number | null;
  followUps: string[];
  privateCount: number;
}
export interface FamilyCalls { thisWeek: number; lastWeek: number; byDay: { date: string; count: number }[]; lastCallAt?: string }
export interface ElderCard extends TodayView {
  ring: "green" | "amber" | "red" | "grey";
  lastCall: { callId: string; at?: string; status: string; summary?: CallSummary; mode?: string } | null;
  liveCall: { callId: string; status: string; mode?: string } | null;
  nudge?: Nudge;
  familyCalls: FamilyCalls;
  openUrgent: number;
}
export interface Overview {
  family: { familyId: string; name: string };
  members: { memberId: string; name: string; relation: string; role: string; telegramLinked: boolean; linkCode?: string }[];
  elders: ElderCard[];
  alerts: Alert[];
}
export interface TimelineCall {
  callId: string; reason: string; status: string; mode?: string; startedAt?: string; endedAt?: string; durationSec?: number;
  summary?: CallSummary; qualityChecks?: Record<string, boolean>; mood?: number; transcriptAvailable: boolean; transcriptPurgeAt?: string;
}
export interface TrendPoint { date: string; mood: number | null; sleep: number | null; pain: number | null; adherence: number | null; taken: number; missed: number }
export interface Integrations { elevenlabs: boolean; briefing: boolean; telegram: boolean; llm: string; dataStore: string; region: string; demoMode: boolean }
export interface Privacy {
  choices: { shareMedicines: boolean; shareWellbeing: boolean; shareMemories: boolean };
  privateCount: number;
  consent: { recordedAt: string; dailyCalls: boolean; preferredTime?: string } | null;
  storedToday: string[];
  retention: { audio: string; transcriptHours: number; kept: string };
  location: string;
  safetyExceptions: string[];
}
export interface Profile {
  elder: { elderId: string; name: string; preferredName: string; age?: number; city: string; phone: string; languages: string[]; primaryLanguage: string; callTimeLocal: string; status: string; pausedUntil?: string; conditions: string[] };
  meds: { medId: string; name: string; dose: string; slots: string[]; withFood?: string; stockCount?: number; addedBy: string }[];
  reminders: { reminderId: string; kind: string; text: string; whenUtc: string }[];
  consent?: { recordedAt: string; dailyCalls: boolean; preferredTime?: string; shareMedicines: boolean; shareWellbeing: boolean; shareMemories: boolean } | null;
}

export type { Alert, CallSummary, LiveEvent, Memory, Message, Nudge };
