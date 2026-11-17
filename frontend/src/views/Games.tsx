import { useMemo, useState } from "react";
import { api } from "../api";
import { go } from "../router";
import { useStore } from "../store";
import { computeStats, fmtDate, isDone, rank, teamA, teamB } from "../stats";
import type { Match } from "../types";
import { Empty, Form, PageHead, PlayerTag } from "../ui";

export default function Games({ sessionId }: { sessionId?: number }) {
  const { sessions, matches, members, reload, toast } = useStore();
  const current = sessions.find((s) => s.id === sessionId) ?? sessions[0];

  const progress = useMemo(() => {
    const m = new Map<number, { done: number; total: number }>();
    for (const x of matches) {
      const p = m.get(x.sessionId) ?? { done: 0, total: 0 };
      p.total++;
      if (isDone(x)) p.done++;
      m.set(x.sessionId, p);
    }
    return m;
  }, [matches]);

  if (!sessions.length) {
    return (
      <div className="stack">
        <PageHead kicker="Scores" title="경기 기록" />
        <Empty title="저장된 대진표가 없어요" action={<a className="btn btn-primary" href="#/draw">대진 만들기</a>}>
          대진 작성 화면에서 대진표를 저장하면 여기에서 점수를 입력할 수 있어요.
        </Empty>
      </div>
    );
  }

  const own = matches.filter((m) => m.sessionId === current.id).sort((a, b) => a.round - b.round || a.court - b.court);
  const byRound = new Map<number, Match[]>();
  own.forEach((m) => byRound.set(m.round, [...(byRound.get(m.round) ?? []), m]));
  const dayStats = rank(computeStats(members, own, sessions));

  const remove = async () => {
    if (!confirm(`'${current.title}' 대진표와 경기 기록을 모두 삭제할까요?`)) return;
    try {
      await api.deleteSession(current.id);
      await reload();
      toast("대진표를 삭제했어요");
      go("/games");
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const p = progress.get(current.id) ?? { done: 0, total: 0 };

  const removeRound = async (round: number, list: Match[]) => {
    const played = list.filter(isDone).length;
    const msg = `${round}라운드 경기 ${list.length}개를 삭제할까요?` + (played ? `\n입력된 점수 ${played}개도 함께 지워집니다.` : "") + "\n뒤 라운드 번호는 하나씩 당겨집니다.";
    if (!confirm(msg)) return;
    try {
      await api.deleteRound(current.id, round);
      await reload();
      toast(`${round}라운드를 삭제했어요`);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  return (
    <div className="stack">
      <PageHead kicker="Scores" title="경기 기록">
        <a className="btn btn-primary" href="#/draw">+ 새 대진</a>
      </PageHead>

      <div className="games-layout">
        <aside className="session-list">
          {sessions.map((s) => {
            const pr = progress.get(s.id) ?? { done: 0, total: 0 };
            return (
              <a key={s.id} href={`#/games/${s.id}`} className={`session-item ${s.id === current.id ? "on" : ""}`}>
                <small>{fmtDate(s.playDate)}</small>
                <b>{s.title}</b>
                <div className="bar"><i style={{ width: `${pr.total ? (pr.done / pr.total) * 100 : 0}%` }} /></div>
                <small className="muted">{s.format === "doubles" ? "복식" : "단식"} · {pr.done}/{pr.total} 경기 입력</small>
              </a>
            );
          })}
        </aside>

        <div className="stack">
          <section className="card">
            <div className="card-head">
              <div>
                <div className="kicker">{fmtDate(current.playDate)} · {current.format === "doubles" ? "복식" : "단식"} · {current.courts}코트</div>
                <h2>{current.title}</h2>
              </div>
              <div className="btn-row">
                <span className="pill">{p.done}/{p.total} 입력</span>
                <button className="btn btn-sm btn-danger-ghost" onClick={remove}>삭제</button>
              </div>
            </div>
            {[...byRound.entries()].map(([round, list]) => (
              <div key={round} className="score-round">
                <div className="round-head score-round-head">
                  <span>ROUND <b>{round}</b></span>
                  <button className="link danger" onClick={() => removeRound(round, list)}>라운드 삭제</button>
                </div>
                {list.map((m) => <ScoreRow key={m.id} match={m} />)}
              </div>
            ))}
          </section>

          {dayStats.length > 0 && (
            <section className="card">
              <h2>오늘의 성적</h2>
              <table className="table compact">
                <thead><tr><th>#</th><th>이름</th><th>승</th><th>무</th><th>패</th><th>득실</th><th>흐름</th></tr></thead>
                <tbody>
                  {dayStats.map((s, i) => (
                    <tr key={s.member.id}>
                      <td>{i + 1}</td>
                      <td><b>{s.member.name}</b></td>
                      <td>{s.wins}</td>
                      <td>{s.draws}</td>
                      <td>{s.losses}</td>
                      <td className={s.gamesFor - s.gamesAgainst >= 0 ? "pos" : "neg"}>{s.gamesFor - s.gamesAgainst > 0 ? "+" : ""}{s.gamesFor - s.gamesAgainst}</td>
                      <td><Form form={s.form} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

const PRESETS: [number, number][] = [[6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [7, 5], [7, 6]];
const DRAW_PRESETS = [3, 4, 5, 6];

function ScoreRow({ match }: { match: Match }) {
  const { memberById, setMatches, reload, toast } = useStore();

  const removeCourt = async () => {
    if (!confirm(`${match.round}라운드 ${match.court}코트 경기를 삭제할까요?` + (isDone(match) ? "\n입력된 점수도 함께 지워집니다." : ""))) return;
    try {
      await api.deleteMatch(match.id);
      setMatches((ms) => ms.filter((m) => m.id !== match.id));
      toast("경기를 삭제했어요");
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const done = isDone(match);
  const [edit, setEdit] = useState(!done);
  const [a, setA] = useState(match.scoreA?.toString() ?? "");
  const [b, setB] = useState(match.scoreB?.toString() ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async (sa: number | null, sb: number | null) => {
    setBusy(true);
    try {
      const row = await api.setScore(match.id, sa, sb, match.scoreVersion);
      setMatches((ms) => ms.map((m) => (m.id === row.id ? row : m)));
      setA(row.scoreA?.toString() ?? "");
      setB(row.scoreB?.toString() ?? "");
      setEdit(sa === null);
      toast(sa === null ? "점수를 지웠어요" : "결과를 기록했어요");
    } catch (e) {
      if ((e as Error).message.includes("먼저 점수를 수정") || (e as Error).message.includes("다른 사용자에 의해 변경")) {
        await reload();
      }
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  const aWin = done && match.scoreA! > match.scoreB!;
  const bWin = done && match.scoreB! > match.scoreA!;
  const isDraw = done && match.scoreA === match.scoreB;

  return (
    <div className={`score-row ${done ? "is-done" : ""}`}>
      <div className="court-no">C{match.court}</div>
      <button className="row-del" onClick={removeCourt} title="이 코트 경기 삭제" aria-label={`${match.round}라운드 ${match.court}코트 경기 삭제`}>×</button>
      <div className={`side ${aWin ? "winner" : ""}`}>
        {teamA(match).map((id) => <PlayerTag key={id} m={memberById.get(id)} />)}
        {aWin && <span className="win-badge">WIN</span>}
        {isDraw && <span className="draw-badge">DRAW</span>}
      </div>
      <div className="score-box">
        {edit ? (
          <form
            className="score-inputs"
            onSubmit={(e) => {
              e.preventDefault();
              if (a === "" || b === "") return toast("양 팀 점수를 모두 입력해 주세요", "err");
              submit(Number(a), Number(b));
            }}
          >
            <input className="input num-in" inputMode="numeric" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, "").slice(0, 2))} aria-label="A팀 점수" />
            <span>:</span>
            <input className="input num-in" inputMode="numeric" value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, "").slice(0, 2))} aria-label="B팀 점수" />
            <button className="btn btn-primary btn-sm" disabled={busy}>저장</button>
            <div className="presets">
              <div><small>◀ 승</small>{PRESETS.map(([x, y]) => (
                <button key={`a${x}${y}`} type="button" onClick={() => submit(x, y)} disabled={busy}>{x}:{y}</button>
              ))}</div>
              <div><small>승 ▶</small>{PRESETS.map(([x, y]) => (
                <button key={`b${x}${y}`} type="button" onClick={() => submit(y, x)} disabled={busy}>{y}:{x}</button>
              ))}</div>
              <div className="draw-presets"><small>무승부</small>{DRAW_PRESETS.map((x) => (
                <button key={`d${x}`} type="button" onClick={() => submit(x, x)} disabled={busy}>{x}:{x}</button>
              ))}</div>
            </div>
          </form>
        ) : (
          <button className="score-final" onClick={() => setEdit(true)} title="점수 수정">
            <b className={aWin ? "w" : ""}>{match.scoreA}</b>
            <span>:</span>
            <b className={bWin ? "w" : ""}>{match.scoreB}</b>
            <small>수정</small>
          </button>
        )}
        {edit && done && (
          <div className="score-links">
            <button className="link" onClick={() => setEdit(false)}>취소</button>
            <button className="link danger" onClick={() => submit(null, null)}>점수 지우기</button>
          </div>
        )}
      </div>
      <div className={`side right ${bWin ? "winner" : ""}`}>
        {bWin && <span className="win-badge">WIN</span>}
        {isDraw && <span className="draw-badge">DRAW</span>}
        {teamB(match).map((id) => <PlayerTag key={id} m={memberById.get(id)} />)}
      </div>
    </div>
  );
}
