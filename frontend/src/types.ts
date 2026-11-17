export type Gender = "M" | "F";

export interface Member {
  id: number;
  name: string;
  gender: Gender;
  level: number;
  phone: string;
  memo: string;
  active: boolean;
  joinedAt: string;
  createdAt: string;
}

export type Format = "doubles" | "singles";

export interface Session {
  id: number;
  title: string;
  playDate: string;
  format: Format;
  courts: number;
  createdAt: string;
}

export interface Match {
  id: number;
  sessionId: number;
  round: number;
  court: number;
  teamA1: number;
  teamA2: number | null;
  teamB1: number;
  teamB2: number | null;
  scoreA: number | null;
  scoreB: number | null;
  scoreVersion?: number; // FastAPI optimistic concurrency; omitted by historical records
}

export interface DraftMatch {
  round: number;
  court: number;
  a: number[];
  b: number[];
}

export interface DraftRound {
  round: number;
  matches: DraftMatch[];
  resting: number[];
}
