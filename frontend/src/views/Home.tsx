import { useMemo } from "react";
import { useStore } from "../store";
import { computeStats, fmtDate, isDone, pct, rank, teamA, teamB, today } from "../stats";
import { Avatar, Empty, Form } from "../ui";

export default function Home() {
  const { members, sessions, matches, memberById } = useStore();
  const active = members.filter((m) => m.active);
  const done = matches.filter(isDone);
  const pending = matches.length - done.length;
  const month = today().slice(0, 7);
  const monthSessions = sessions.filter((s) => s.playDate.startsWith(month));
  const top = useMemo(() => rank(computeStats(members, matches, sessions)).slice(0, 5), [members, matches, sessions]);
  const latest = sessions[0];
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const recent = [...done]
    .sort((a, b) => (sessionById.get(b.sessionId)?.playDate ?? "").localeCompare(sessionById.get(a.sessionId)?.playDate ?? "") || b.id - a.id)
    .slice(0, 6);
  const names = (ids: number[]) => ids.map((id) => memberById.get(id)?.name ?? "?").join(" · ");

  return (
    <div className="stack">
      <section className="hero">
        <div className="hero-copy">
          <div className="kicker light">오늘도 좋은 랠리를</div>
          <h1>회원 관리부터 대진표,<br />승패 기록까지 한 코트에서.</h1>
          <p>참석자만 고르면 휴식과 파트너가 고르게 돌아가는 연습게임 대진이 자동으로 만들어집니다. 경기가 끝나면 점수만 입력하세요.</p>
          <div className="hero-actions">
            <a className="btn btn-ball" href="#/draw">대진 만들기 →</a>
            <a className="btn btn-ghost-light" href="#/members">회원 등록</a>
          </div>
        </div>
        <div className="hero-court" aria-hidden>
          <div className="court-lines"><span /><span /><span /></div>
          <div className="hero-ball" />
        </div>
      </section>

      <section className="kpis">
        <div className="kpi"><span>활동 회원</span><b>{active.length}</b><small>전체 {members.length}명</small></div>
        <div className="kpi"><span>이번 달 모임</span><b>{monthSessions.length}</b><small>누적 {sessions.length}회</small></div>
        <div className="kpi"><span>기록된 경기</span><b>{done.length}</b><small>총 {matches.length}경기</small></div>
        <a className={`kpi ${pending ? "kpi-alert" : ""}`} href={latest ? `#/games/${latest.id}` : "#/games"}>
          <span>점수 미입력</span><b>{pending}</b><small>{pending ? "입력하러 가기 →" : "모두 입력 완료"}</small>
        </a>
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>승률 TOP 5</h2>
            <a href="#/ranking" className="link">전체 순위 →</a>
          </div>
          {top.length === 0 ? (
            <Empty title="아직 기록된 경기가 없어요">대진을 만들고 점수를 입력하면 순위가 표시됩니다.</Empty>
          ) : (
            <ol className="toplist">
              {top.map((s, i) => (
                <li key={s.member.id}>
                  <span className={`medal m${i + 1}`}>{i + 1}</span>
                  <Avatar m={s.member} />
                  <div className="grow">
                    <b>{s.member.name}</b>
                    <small className="muted">{s.wins}승 {s.draws > 0 ? `${s.draws}무 ` : ""}{s.losses}패</small>
                  </div>
                  <Form form={s.form} />
                  <b className="num">{pct(s.winRate)}</b>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>최근 경기 결과</h2>
            <a href="#/games" className="link">경기 기록 →</a>
          </div>
          {recent.length === 0 ? (
            <Empty title="최근 결과가 없어요" />
          ) : (
            <ul className="results">
              {recent.map((m) => {
                const aWin = m.scoreA! > m.scoreB!;
                const bWin = m.scoreB! > m.scoreA!;
                return (
                  <li key={m.id}>
                    <small className="muted">{fmtDate(sessionById.get(m.sessionId)?.playDate ?? "")} · {m.round}R</small>
                    <div className="result-row">
                      <span className={aWin ? "win" : ""}>{names(teamA(m))}</span>
                      <b className="score">{m.scoreA} : {m.scoreB}</b>
                      <span className={bWin ? "win" : ""}>{names(teamB(m))}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
