import type { Match, Member, Session } from "./types";

export interface MemberStats {
  member: Member;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  gamesFor: number;
  gamesAgainst: number;
  winRate: number;
  form: Result[]; // 최근 5경기 (최신이 앞)
  streak: number; // +연승 / -연패 (무승부는 연속 기록을 끊음)
}

export type Result = "W" | "D" | "L";

/** 팀 A 기준 결과 */
export const resultA = (m: Match): Result => (m.scoreA! > m.scoreB! ? "W" : m.scoreA! < m.scoreB! ? "L" : "D");
export const flip = (r: Result): Result => (r === "W" ? "L" : r === "L" ? "W" : "D");
/** 무승부는 0.5승으로 계산 */
export const rateOf = (w: number, d: number, l: number) => (w + d + l ? (w + d / 2) / (w + d + l) : 0);

/** 날짜(YYYY-MM-DD)가 since~until(양 끝 포함) 범위인지 */
export const inRange = (d: string, since?: string, until?: string) => (!since || d >= since) && (!until || d <= until);

export const isDone = (m: Match) => m.scoreA !== null && m.scoreB !== null && !(m.scoreA === 0 && m.scoreB === 0);

export const teamA = (m: Match) => [m.teamA1, m.teamA2].filter((x): x is number => x !== null);
export const teamB = (m: Match) => [m.teamB1, m.teamB2].filter((x): x is number => x !== null);

export function computeStats(members: Member[], matches: Match[], sessions: Session[], since?: string, until?: string): MemberStats[] {
  const dateOf = new Map(sessions.map((s) => [s.id, s.playDate]));
  const done = matches
    .filter(isDone)
    .filter((m) => inRange(dateOf.get(m.sessionId) ?? "", since, until))
    .sort((x, y) => {
      const d = (dateOf.get(y.sessionId) ?? "").localeCompare(dateOf.get(x.sessionId) ?? "");
      return d !== 0 ? d : y.sessionId - x.sessionId || y.round - x.round;
    });

  const map = new Map<number, MemberStats>();
  for (const member of members) {
    map.set(member.id, { member, games: 0, wins: 0, losses: 0, draws: 0, gamesFor: 0, gamesAgainst: 0, winRate: 0, form: [], streak: 0 });
  }
  for (const m of done) {
    const ra = resultA(m);
    const apply = (ids: number[], r: Result, gf: number, ga: number) => {
      for (const id of ids) {
        const s = map.get(id);
        if (!s) continue;
        s.games++;
        if (r === "W") s.wins++; else if (r === "L") s.losses++; else s.draws++;
        s.gamesFor += gf;
        s.gamesAgainst += ga;
        s.form.push(r);
      }
    };
    apply(teamA(m), ra, m.scoreA!, m.scoreB!);
    apply(teamB(m), flip(ra), m.scoreB!, m.scoreA!);
  }
  for (const s of map.values()) {
    s.winRate = rateOf(s.wins, s.draws, s.losses);
    if (s.form.length) {
      const first = s.form[0];
      let n = 0;
      while (n < s.form.length && s.form[n] === first) n++;
      s.streak = first === "W" ? n : first === "L" ? -n : 0;
    }
    s.form = s.form.slice(0, 5);
  }
  return [...map.values()];
}

export function rank(stats: MemberStats[], minGames = 1): MemberStats[] {
  return stats
    .filter((s) => s.games >= minGames)
    .sort(
      (a, b) =>
        b.winRate - a.winRate ||
        b.wins - a.wins ||
        b.gamesFor - b.gamesAgainst - (a.gamesFor - a.gamesAgainst) ||
        a.member.name.localeCompare(b.member.name)
    );
}

export const pct = (n: number) => `${Math.round(n * 100)}%`;

export const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  const w = ["일", "월", "화", "수", "목", "금", "토"][new Date(y, m - 1, day).getDay()];
  return `${m}월 ${day}일 (${w})`;
};

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
