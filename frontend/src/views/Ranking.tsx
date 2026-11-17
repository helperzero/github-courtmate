import { useMemo, useState } from "react";
import { useStore } from "../store";
import { computeStats, flip, inRange, isDone, pct, rank, rateOf, resultA, teamA, teamB, today } from "../stats";
import { Avatar, Empty, Form, PageHead } from "../ui";

type Period = "all" | "month" | "90" | "custom";

export default function Ranking() {
  const { members, matches, sessions, memberById } = useStore();
  const [period, setPeriod] = useState<Period>("all");
  const [minGames, setMinGames] = useState(1);
  const [focus, setFocus] = useState<number | null>(null);
  const [from, setFrom] = useState(() => today().slice(0, 7) + "-01");
  const [to, setTo] = useState(today());

  const [since, until] = useMemo((): [string | undefined, string | undefined] => {
    if (period === "month") return [today().slice(0, 7) + "-01", undefined];
    if (period === "90") {
      const d = new Date(Date.now() - 90 * 864e5);
      return [d.toISOString().slice(0, 10), undefined];
    }
    if (period === "custom") {
      // 시작일이 종료일보다 늦으면 자동으로 뒤집어서 적용
      const [a, b] = from && to && from > to ? [to, from] : [from, to];
      return [a || undefined, b || undefined];
    }
    return [undefined, undefined];
  }, [period, from, to]);

  const rows = useMemo(() => rank(computeStats(members, matches, sessions, since, until), minGames), [members, matches, sessions, since, until, minGames]);

  // 선택한 회원의 파트너/상대 전적
  const detail = useMemo(() => {
    if (focus === null) return null;
    const dateOf = new Map(sessions.map((s) => [s.id, s.playDate]));
    const partner = new Map<number, { w: number; d: number; l: number }>();
    const opp = new Map<number, { w: number; d: number; l: number }>();
    for (const m of matches) {
      if (!isDone(m) || !inRange(dateOf.get(m.sessionId) ?? "", since, until)) continue;
      const A = teamA(m), B = teamB(m);
      const mine = A.includes(focus) ? A : B.includes(focus) ? B : null;
      if (!mine) continue;
      const theirs = mine === A ? B : A;
      const res = mine === A ? resultA(m) : flip(resultA(m));
      const bump = (map: Map<number, { w: number; d: number; l: number }>, id: number) => {
        const r = map.get(id) ?? { w: 0, d: 0, l: 0 };
        if (res === "W") r.w++; else if (res === "L") r.l++; else r.d++;
        map.set(id, r);
      };
      mine.filter((id) => id !== focus).forEach((id) => bump(partner, id));
      theirs.forEach((id) => bump(opp, id));
    }
    const sort = (map: Map<number, { w: number; d: number; l: number }>) =>
      [...map.entries()].sort((a, b) => b[1].w + b[1].d + b[1].l - (a[1].w + a[1].d + a[1].l) || b[1].w - a[1].w).slice(0, 6);
    return { partner: sort(partner), opp: sort(opp) };
  }, [focus, matches, sessions, since, until]);

  const focused = focus !== null ? rows.find((r) => r.member.id === focus) : undefined;

  return (
    <div className="stack">
      <PageHead kicker="Ranking" title="순위 & 전적" />

      <div className="toolbar">
        <div className="seg">
          {([["all", "전체 기간"], ["month", "이번 달"], ["90", "최근 90일"], ["custom", "기간 지정"]] as const).map(([k, l]) => (
            <button key={k} className={period === k ? "on" : ""} onClick={() => setPeriod(k)}>{l}</button>
          ))}
        </div>
        {period === "custom" && (
          <div className="date-range">
            <input className="input" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="시작일" />
            <span className="muted">~</span>
            <input className="input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="종료일" />
          </div>
        )}
        <label className="muted small inline">
          최소 경기 수
          <select className="input select" value={minGames} onChange={(e) => setMinGames(Number(e.target.value))}>
            {[1, 3, 5, 10].map((n) => <option key={n} value={n}>{n}경기 이상</option>)}
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <Empty title="해당 기간에 기록된 경기가 없어요">경기 기록 화면에서 점수를 입력하면 순위가 집계됩니다.</Empty>
      ) : (
        <div className="ranking-layout">
          <section className="card table-card">
            <table className="table">
              <thead>
                <tr><th>순위</th><th>회원</th><th>경기</th><th>승</th><th>무</th><th>패</th><th>승률</th><th>게임 득실</th><th>최근 5경기</th><th>연속</th></tr>
              </thead>
              <tbody>
                {rows.map((s, i) => {
                  const diff = s.gamesFor - s.gamesAgainst;
                  let rankNo = i;
                  while (rankNo > 0) {
                    const prev = rows[rankNo - 1];
                    if (prev.winRate !== s.winRate || prev.wins !== s.wins || prev.gamesFor - prev.gamesAgainst !== diff) break;
                    rankNo--;
                  }
                  rankNo += 1;
                  return (
                    <tr key={s.member.id} className={focus === s.member.id ? "on" : ""} onClick={() => setFocus(s.member.id === focus ? null : s.member.id)}>
                      <td><span className={`medal m${rankNo}`}>{rankNo}</span></td>
                      <td><span className="who"><Avatar m={s.member} size={28} /><b>{s.member.name}</b><small className="muted">{s.member.level.toFixed(1)}</small></span></td>
                      <td>{s.games}</td>
                      <td>{s.wins}</td>
                      <td>{s.draws}</td>
                      <td>{s.losses}</td>
                      <td>
                        <span className="rate"><i style={{ width: pct(s.winRate) }} /></span>
                        <b className="num">{pct(s.winRate)}</b>
                      </td>
                      <td className={diff >= 0 ? "pos" : "neg"}>{diff > 0 ? "+" : ""}{diff}</td>
                      <td><Form form={s.form} /></td>
                      <td>{s.streak > 1 ? <span className="streak hot">{s.streak}연승</span> : s.streak < -1 ? <span className="streak">{-s.streak}연패</span> : <span className="muted">-</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="muted small hint">회원을 누르면 파트너별 · 상대별 전적을 볼 수 있어요.</p>
          </section>

          {focused && detail && (
            <aside className="card h2h">
              <div className="member-top">
                <Avatar m={focused.member} size={48} />
                <div className="grow">
                  <b>{focused.member.name}</b>
                  <small className="muted">{focused.wins}승 {focused.draws > 0 ? `${focused.draws}무 ` : ""}{focused.losses}패 · {pct(focused.winRate)}</small>
                </div>
                <button className="btn btn-sm" onClick={() => setFocus(null)}>닫기</button>
              </div>
              {detail.partner.length > 0 && (
                <>
                  <h3>파트너별 전적</h3>
                  <ul className="h2h-list">
                    {detail.partner.map(([id, r]) => (
                      <li key={id}><span>{memberById.get(id)?.name}</span><span className="muted">{r.w}승 {r.d > 0 ? `${r.d}무 ` : ""}{r.l}패</span><b>{pct(rateOf(r.w, r.d, r.l))}</b></li>
                    ))}
                  </ul>
                </>
              )}
              <h3>상대별 전적</h3>
              <ul className="h2h-list">
                {detail.opp.map(([id, r]) => (
                  <li key={id}><span>{memberById.get(id)?.name}</span><span className="muted">{r.w}승 {r.d > 0 ? `${r.d}무 ` : ""}{r.l}패</span><b>{pct(rateOf(r.w, r.d, r.l))}</b></li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
