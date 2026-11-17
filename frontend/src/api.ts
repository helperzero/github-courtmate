import type { Match, Member, Session, DraftMatch, Format } from "./types";

const apiBase = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/+$/, "");

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `요청 실패 (${res.status})`);
  return data as T;
}

export type MemberInput = Omit<Member, "id" | "createdAt">;

export const api = {
  members: () => req<Member[]>("/members"),
  createMember: (m: MemberInput) => req<Member>("/members", { method: "POST", body: JSON.stringify(m) }),
  updateMember: (id: number, m: MemberInput) =>
    req<Member>(`/members/${id}`, { method: "PUT", body: JSON.stringify(m) }),
  deleteMember: (id: number) =>
    req<{ deleted?: boolean; archived?: boolean }>(`/members/${id}`, { method: "DELETE" }),

  sessions: () => req<Session[]>("/sessions"),
  createSession: (s: { title: string; playDate: string; format: Format; courts: number; matches: DraftMatch[] }) =>
    req<Session>("/sessions", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        ...s,
        matches: s.matches.map((m) => ({
          round: m.round,
          court: m.court,
          teamA1: m.a[0],
          teamA2: m.a[1] ?? null,
          teamB1: m.b[0],
          teamB2: m.b[1] ?? null,
        })),
      }),
    }),
  deleteSession: (id: number) => req(`/sessions/${id}`, { method: "DELETE" }),

  deleteRound: (sessionId: number, round: number) => req(`/sessions/${sessionId}/rounds/${round}`, { method: "DELETE" }),

  matches: () => req<Match[]>("/matches"),
  deleteMatch: (id: number) => req(`/matches/${id}`, { method: "DELETE" }),
  setScore: (id: number, scoreA: number | null, scoreB: number | null, scoreVersion?: number) =>
    req<Match>(`/matches/${id}/score`, { method: "PUT", body: JSON.stringify({ scoreA, scoreB, scoreVersion }) }),
};
