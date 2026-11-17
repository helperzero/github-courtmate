import type { DraftRound, Format, Member } from "./types";

export type PairMode = "random" | "balanced" | "mixed";

export interface PairOptions {
  players: Member[];
  courts: number;
  rounds: number;
  format: Format;
  mode: PairMode;
}

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const key = (x: number, y: number) => (x < y ? `${x}-${y}` : `${y}-${x}`);

/**
 * 연습게임 대진 자동 생성.
 * - 경기 수가 적은 회원부터 우선 배정해 휴식이 고르게 돌아가도록 함
 * - 같은 파트너/상대가 반복되지 않도록 비용을 매겨 여러 번 시도 후 최적안 선택
 * - balanced: 팀 실력(NTRP) 합이 비슷하도록, mixed: 남녀 혼합 팀 우선
 */
export function generateRounds(opts: PairOptions): DraftRound[] {
  const { players, courts, rounds, format, mode } = opts;
  const size = format === "doubles" ? 4 : 2;
  const byId = new Map(players.map((p) => [p.id, p]));
  const played = new Map<number, number>(players.map((p) => [p.id, 0]));
  const restedLast = new Set<number>();
  const partners = new Map<string, number>();
  const opponents = new Map<string, number>();
  const result: DraftRound[] = [];

  const lvl = (id: number) => byId.get(id)?.level ?? 3;
  const teamCost = (t: number[]) => {
    let c = 0;
    if (t.length === 2) {
      c += (partners.get(key(t[0], t[1])) ?? 0) * 12;
      if (mode === "mixed") {
        const g = t.map((id) => byId.get(id)?.gender);
        if (g[0] === g[1]) c += 8;
      }
    }
    return c;
  };
  const matchCost = (a: number[], b: number[]) => {
    let c = teamCost(a) + teamCost(b);
    for (const x of a) for (const y of b) c += (opponents.get(key(x, y)) ?? 0) * 3;
    const diff = Math.abs(a.reduce((s, id) => s + lvl(id), 0) - b.reduce((s, id) => s + lvl(id), 0));
    c += diff * (mode === "balanced" ? 10 : mode === "mixed" ? 4 : 1);
    return c;
  };
  const bestSplit = (g: number[]): [number[], number[], number] => {
    if (g.length === 2) return [[g[0]], [g[1]], matchCost([g[0]], [g[1]])];
    const options: [number[], number[]][] = [
      [[g[0], g[1]], [g[2], g[3]]],
      [[g[0], g[2]], [g[1], g[3]]],
      [[g[0], g[3]], [g[1], g[2]]],
    ];
    let best = options[0], bestC = Infinity;
    for (const [a, b] of options) {
      const c = matchCost(a, b);
      if (c < bestC) { bestC = c; best = [a, b]; }
    }
    return [best[0], best[1], bestC];
  };

  for (let r = 1; r <= rounds; r++) {
    const courtsUsed = Math.min(courts, Math.floor(players.length / size));
    if (courtsUsed === 0) break;
    const need = courtsUsed * size;

    // 경기 수가 적고, 직전 라운드에 쉰 사람 우선
    const ordered = shuffle(players.map((p) => p.id)).sort((x, y) => {
      const d = (played.get(x) ?? 0) - (played.get(y) ?? 0);
      if (d !== 0) return d;
      return (restedLast.has(y) ? 1 : 0) - (restedLast.has(x) ? 1 : 0);
    });
    let playing = ordered.slice(0, need);
    const resting = ordered.slice(need);

    // 혼복: 가능한 한 남녀 수를 맞춤
    if (mode === "mixed" && format === "doubles") {
      const half = need / 2;
      const males = ordered.filter((id) => byId.get(id)?.gender === "M");
      const females = ordered.filter((id) => byId.get(id)?.gender === "F");
      const nf = Math.min(females.length, half);
      const nm = Math.min(males.length, need - nf);
      const pick = [...females.slice(0, nf), ...males.slice(0, nm)];
      if (pick.length === need) {
        playing = pick;
        resting.length = 0;
        resting.push(...ordered.filter((id) => !pick.includes(id)));
      }
    }

    let bestRound: { a: number[]; b: number[] }[] = [];
    let bestCost = Infinity;
    for (let t = 0; t < 250; t++) {
      let pool = shuffle(playing);
      if (mode === "mixed" && format === "doubles") {
        // 남녀 교차 배치로 혼합 팀이 나오기 쉽게
        const f = pool.filter((id) => byId.get(id)?.gender === "F");
        const m = pool.filter((id) => byId.get(id)?.gender !== "F");
        pool = [];
        while (f.length || m.length) {
          if (f.length) pool.push(f.shift()!);
          if (m.length) pool.push(m.shift()!);
        }
        // 4명 그룹마다 F,M,F,M -> 섞기
        const groups: number[][] = [];
        for (let i = 0; i < pool.length; i += 4) groups.push(pool.slice(i, i + 4));
        pool = shuffle(groups).flat();
      }
      let total = 0;
      const ms: { a: number[]; b: number[] }[] = [];
      for (let i = 0; i < pool.length; i += size) {
        const [a, b, c] = bestSplit(pool.slice(i, i + size));
        total += c;
        ms.push({ a, b });
      }
      if (total < bestCost) { bestCost = total; bestRound = ms; }
      if (bestCost === 0) break;
    }

    // 기록 반영
    for (const { a, b } of bestRound) {
      if (a.length === 2) partners.set(key(a[0], a[1]), (partners.get(key(a[0], a[1])) ?? 0) + 1);
      if (b.length === 2) partners.set(key(b[0], b[1]), (partners.get(key(b[0], b[1])) ?? 0) + 1);
      for (const x of a) for (const y of b) opponents.set(key(x, y), (opponents.get(key(x, y)) ?? 0) + 1);
      for (const id of [...a, ...b]) played.set(id, (played.get(id) ?? 0) + 1);
    }
    restedLast.clear();
    resting.forEach((id) => restedLast.add(id));

    result.push({
      round: r,
      matches: bestRound.map((m, i) => ({ round: r, court: i + 1, a: m.a, b: m.b })),
      resting,
    });
  }
  return result;
}
