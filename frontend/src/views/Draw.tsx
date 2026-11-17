import { useMemo, useState } from "react";
import { api } from "../api";
import { generateRounds, type PairMode } from "../pairing";
import { go } from "../router";
import { useStore } from "../store";
import { fmtDate, today } from "../stats";
import type { DraftMatch, DraftRound, Format, Member } from "../types";
import { Empty, PageHead, PlayerTag } from "../ui";

const MODES: { id: PairMode; label: string; desc: string }[] = [
  { id: "random", label: "랜덤", desc: "파트너·상대 중복만 피해서 무작위" },
  { id: "balanced", label: "실력 균형", desc: "양 팀 NTRP 합이 비슷하게" },
  { id: "mixed", label: "혼합 복식", desc: "가능하면 남녀 한 팀으로" },
];

type Method = "auto" | "manual";
/** 수동 대진 한 코트의 자리: [A1, A2, B1, B2] (단식은 A1, B1만 사용) */
type Slots = (number | null)[];
const EMPTY: Slots = [null, null, null, null];
const slotIdx = (format: Format) => (format === "doubles" ? [0, 1, 2, 3] : [0, 2]);
const cellKey = (round: number, court: number) => `${round}-${court}`;

export default function Draw() {
  const { members, memberById, reload, toast } = useStore();
  const active = useMemo(() => members.filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name, "ko")), [members]);

  const [date, setDate] = useState(today());
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<Format>("doubles");
  const [mode, setMode] = useState<PairMode>("random");
  const [courts, setCourts] = useState(2);
  const [rounds, setRounds] = useState(4);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [draft, setDraft] = useState<DraftRound[] | null>(null);
  const [draftSignature, setDraftSignature] = useState("");
  const [swap, setSwap] = useState<{ round: number; id: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [method, setMethod] = useState<Method>("auto");
  const [board, setBoard] = useState<Record<string, Slots>>({});

  const size = format === "doubles" ? 4 : 2;
  const players = active.filter((m) => picked.has(m.id));
  const playable = Math.min(courts, Math.floor(players.length / size));
  const canGenerate = playable > 0;
  const signature = JSON.stringify([date, format, mode, courts, rounds, [...picked].sort((a, b) => a - b)]);
  const currentDraft = draftSignature === signature ? draft : null;

  const toggle = (id: number) => {
    setPicked((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const generate = () => {
    setDraft(generateRounds({ players, courts, rounds, format, mode }));
    setDraftSignature(signature);
    setSwap(null);
  };

  const playCount = useMemo(() => {
    const c = new Map<number, number>();
    currentDraft?.forEach((r) => r.matches.forEach((m) => [...m.a, ...m.b].forEach((id) => c.set(id, (c.get(id) ?? 0) + 1))));
    return c;
  }, [currentDraft]);

  const clickPlayer = (round: number, id: number) => {
    if (!swap || swap.round !== round) return setSwap({ round, id });
    if (swap.id === id) return setSwap(null);
    const x = swap.id, y = id;
    const sw = (v: number) => (v === x ? y : v === y ? x : v);
    setDraft((d) =>
      d!.map((r) =>
        r.round !== round
          ? r
          : { ...r, matches: r.matches.map((m) => ({ ...m, a: m.a.map(sw), b: m.b.map(sw) })), resting: r.resting.map(sw) }
      )
    );
    setSwap(null);
  };

  // ----- 수동 작성 -----
  const idx = slotIdx(format);
  const pool = picked.size ? players : active; // 참석자를 고르지 않았으면 전체 활동 회원
  const slotsOf = (r: number, c: number) => board[cellKey(r, c)] ?? EMPTY;
  const setSlot = (r: number, c: number, i: number, id: number | null) =>
    setBoard((b) => {
      const k = cellKey(r, c);
      const next = [...(b[k] ?? EMPTY)];
      next[i] = id;
      return { ...b, [k]: next };
    });
  const clearCell = (r: number, c: number) => setBoard((b) => ({ ...b, [cellKey(r, c)]: EMPTY }));
  const usedIn = (r: number) => {
    const u = new Set<number>();
    for (let c = 1; c <= courts; c++) idx.forEach((i) => { const v = slotsOf(r, c)[i]; if (v) u.add(v); });
    return u;
  };
  const copyPrevRound = (r: number) =>
    setBoard((b) => {
      const n = { ...b };
      for (let c = 1; c <= courts; c++) n[cellKey(r, c)] = [...(b[cellKey(r - 1, c)] ?? EMPTY)];
      return n;
    });
  const manualCount = useMemo(() => {
    const cnt = new Map<number, number>();
    for (let r = 1; r <= rounds; r++)
      for (let c = 1; c <= courts; c++) {
        const s = board[cellKey(r, c)] ?? EMPTY;
        if (idx.every((i) => s[i])) idx.forEach((i) => cnt.set(s[i]!, (cnt.get(s[i]!) ?? 0) + 1));
      }
    return cnt;
  }, [board, rounds, courts, format]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildManual = (): DraftMatch[] | string => {
    const out: DraftMatch[] = [];
    let roundNo = 0;
    for (let r = 1; r <= rounds; r++) {
      const list: DraftMatch[] = [];
      for (let c = 1; c <= courts; c++) {
        const s = slotsOf(r, c);
        const filled = idx.filter((i) => s[i]).length;
        if (filled === 0) continue;
        if (filled < idx.length) return `${r}라운드 ${c}코트에 빈 자리가 있어요`;
        list.push({ round: 0, court: c, a: format === "doubles" ? [s[0]!, s[1]!] : [s[0]!], b: format === "doubles" ? [s[2]!, s[3]!] : [s[2]!] });
      }
      if (list.length) {
        roundNo++; // 비어 있는 라운드는 건너뛰고 번호를 다시 매김
        list.forEach((m) => out.push({ ...m, round: roundNo }));
      }
    }
    return out.length ? out : "한 경기 이상 선수를 배정해 주세요";
  };

  const saveManual = () => {
    const res = buildManual();
    if (typeof res === "string") return toast(res, "err");
    persist(res);
  };

  const save = () => currentDraft && persist(currentDraft.flatMap((r) => r.matches));

  const persist = async (list: DraftMatch[]) => {
    setSaving(true);
    try {
      const s = await api.createSession({
        title: title.trim() || `${fmtDate(date)} 연습게임`,
        playDate: date,
        format,
        courts: Math.max(...list.map((m) => m.court)),
        matches: list,
      });
      await reload();
      toast("대진표를 저장했어요. 경기 후 점수를 입력하세요!");
      go(`/games/${s.id}`);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setSaving(false);
    }
  };

  if (active.length < 2) {
    return (
      <div className="stack">
        <PageHead kicker="Draw" title="연습게임 대진 작성" />
        <Empty title="대진을 만들려면 회원이 필요해요" action={<a className="btn btn-primary" href="#/members">회원 등록하러 가기</a>}>
          복식은 최소 4명, 단식은 최소 2명의 활동 회원이 필요합니다.
        </Empty>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHead kicker="Draw" title="연습게임 대진 작성" />

      <div className="draw-layout">
        <section className="card settings">
          <h2 className="step"><i>1</i> 모임 설정</h2>
          <div className="field">
            <span>작성 방식</span>
            <div className="seg">
              <button className={method === "auto" ? "on" : ""} onClick={() => setMethod("auto")}>자동 생성</button>
              <button className={method === "manual" ? "on" : ""} onClick={() => setMethod("manual")}>수동 작성</button>
            </div>
          </div>
          <div className="row">
            <label className="field grow">
              <span>날짜</span>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>모임 이름</span>
            <input className="input" placeholder={`${fmtDate(date)} 연습게임`} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="field">
            <span>경기 방식</span>
            <div className="seg">
              <button className={format === "doubles" ? "on" : ""} onClick={() => setFormat("doubles")}>복식</button>
              <button className={format === "singles" ? "on" : ""} onClick={() => { setFormat("singles"); if (mode === "mixed") setMode("random"); }}>단식</button>
            </div>
          </div>
          <div className="row">
            <div className="field grow">
              <span>코트 수</span>
              <Stepper value={courts} min={1} max={12} onChange={setCourts} />
            </div>
            <div className="field grow">
              <span>라운드 수</span>
              <Stepper value={rounds} min={1} max={20} onChange={setRounds} />
            </div>
          </div>
          {method === "auto" && <div className="field">
            <span>짝 짓기</span>
            <div className="modes">
              {MODES.filter((m) => format === "doubles" || m.id !== "mixed").map((m) => (
                <button key={m.id} className={`mode ${mode === m.id ? "on" : ""}`} onClick={() => setMode(m.id)}>
                  <b>{m.label}</b>
                  <small>{m.desc}</small>
                </button>
              ))}
            </div>
          </div>}
        </section>

        <section className="card">
          <div className="card-head">
            <h2 className="step"><i>2</i> 참석자 선택 <span className="pill">{picked.size}명</span></h2>
            <div className="btn-row">
              <button className="btn btn-sm" onClick={() => setPicked(new Set(active.map((m) => m.id)))}>전체 선택</button>
              <button className="btn btn-sm" onClick={() => setPicked(new Set())}>초기화</button>
            </div>
          </div>
          <div className="attend">
            {active.map((m) => (
              <PlayerTag key={m.id} m={m} active={picked.has(m.id)} onClick={() => toggle(m.id)} />
            ))}
          </div>
          {method === "manual" ? (
            <div className="draw-foot">
              <p className="muted small">
                {picked.size
                  ? `선택한 ${picked.size}명이 아래 대진표의 선수 목록에 표시돼요`
                  : "참석자를 고르지 않으면 전체 활동 회원 중에서 선택할 수 있어요"}
              </p>
            </div>
          ) : (
          <div className="draw-foot">
            <p className="muted small">
              {canGenerate
                ? `라운드당 ${playable}코트 · ${playable * size}명 경기, ${players.length - playable * size}명 휴식`
                : `${format === "doubles" ? "복식은 4명" : "단식은 2명"} 이상 선택해 주세요`}
            </p>
            <button className="btn btn-primary btn-lg" disabled={!canGenerate} onClick={generate}>
              {currentDraft ? "↻ 다시 섞기" : "대진 자동 생성"}
            </button>
          </div>
          )}
        </section>
      </div>

      {method === "manual" && (
        <section className="card">
          <div className="card-head">
            <h2 className="step"><i>3</i> 대진표 직접 작성</h2>
            <div className="btn-row">
              <button className="btn" onClick={() => { if (confirm("입력한 대진을 모두 지울까요?")) setBoard({}); }}>전체 비우기</button>
              <button className="btn btn-primary" disabled={saving} onClick={saveManual}>{saving ? "저장 중…" : "대진표 저장"}</button>
            </div>
          </div>
          <p className="muted small hint">
            코트 수·라운드 수로 칸을 만들고 각 자리에 선수를 고르세요. 같은 라운드에 이미 배정된 선수는 선택할 수 없고, 비워 둔 코트는 저장되지 않아요.
          </p>
          <div className="rounds">
            {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => {
              const used = usedIn(r);
              const resting = pool.filter((m) => !used.has(m.id));
              return (
                <div key={r} className="round">
                  <div className="round-head manual-round-head">
                    <span>ROUND <b>{r}</b></span>
                    {r > 1 && <button className="link small" onClick={() => copyPrevRound(r)}>이전 라운드 복사</button>}
                  </div>
                  {Array.from({ length: courts }, (_, j) => j + 1).map((c) => {
                    const s = slotsOf(r, c);
                    const pick = (i: number) => (
                      <SlotSelect key={i} value={s[i]} pool={pool} used={used} memberById={memberById} label={`${r}라운드 ${c}코트 ${i < 2 ? "A" : "B"}팀`} onChange={(id) => setSlot(r, c, i, id)} />
                    );
                    return (
                      <div key={c} className="court-card">
                        <div className="court-no manual-court-no">
                          <span>COURT {c}</span>
                          {idx.some((i) => s[i]) && <button className="link small" onClick={() => clearCell(r, c)}>비우기</button>}
                        </div>
                        <div className="teams">
                          <div className="team slot-team">{format === "doubles" ? [pick(0), pick(1)] : pick(0)}</div>
                          <span className="vs">VS</span>
                          <div className="team slot-team">{format === "doubles" ? [pick(2), pick(3)] : pick(2)}</div>
                        </div>
                      </div>
                    );
                  })}
                  {resting.length > 0 && (
                    <div className="resting">
                      <span className="muted small">미배정</span>
                      {resting.map((m) => <PlayerTag key={m.id} m={m} dim />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="play-count">
            <span className="muted small">1인당 경기 수</span>
            {pool.filter((p) => picked.size || manualCount.has(p.id)).map((p) => (
              <span key={p.id} className="pc">{p.name} <b>{manualCount.get(p.id) ?? 0}</b></span>
            ))}
          </div>
        </section>
      )}

      {method === "auto" && currentDraft && (
        <section className="card">
          <div className="card-head">
            <h2 className="step"><i>3</i> 대진표 확인</h2>
            <div className="btn-row">
              <button className="btn" onClick={generate}>↻ 다시 섞기</button>
              <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? "저장 중…" : "대진표 저장"}</button>
            </div>
          </div>
          <p className="muted small hint">
            선수 두 명을 차례로 누르면 같은 라운드 안에서 자리를 바꿀 수 있어요. (휴식 인원 포함)
          </p>
          <div className="rounds">
            {currentDraft.map((r) => (
              <div key={r.round} className="round">
                <div className="round-head">ROUND <b>{r.round}</b></div>
                {r.matches.map((m) => (
                  <div key={m.court} className="court-card">
                    <div className="court-no">COURT {m.court}</div>
                    <div className="teams">
                      <div className="team">
                        {m.a.map((id) => (
                          <PlayerTag key={id} m={memberById.get(id)} onClick={() => clickPlayer(r.round, id)} active={swap?.round === r.round && swap.id === id} />
                        ))}
                      </div>
                      <span className="vs">VS</span>
                      <div className="team">
                        {m.b.map((id) => (
                          <PlayerTag key={id} m={memberById.get(id)} onClick={() => clickPlayer(r.round, id)} active={swap?.round === r.round && swap.id === id} />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                {r.resting.length > 0 && (
                  <div className="resting">
                    <span className="muted small">휴식</span>
                    {[...r.resting].sort((x, y) => (memberById.get(x)?.name ?? "").localeCompare(memberById.get(y)?.name ?? "", "ko")).map((id) => (
                      <PlayerTag key={id} m={memberById.get(id)} dim onClick={() => clickPlayer(r.round, id)} active={swap?.round === r.round && swap.id === id} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="play-count">
            <span className="muted small">1인당 경기 수</span>
            {players.map((p) => (
              <span key={p.id} className="pc">{p.name} <b>{playCount.get(p.id) ?? 0}</b></span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label="감소">−</button>
      <b>{value}</b>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label="증가">+</button>
    </div>
  );
}

function SlotSelect({ value, pool, used, memberById, label, onChange }: {
  value: number | null;
  pool: Member[];
  used: Set<number>;
  memberById: Map<number, Member>;
  label: string;
  onChange: (id: number | null) => void;
}) {
  const options = value && !pool.some((m) => m.id === value) ? [memberById.get(value)!, ...pool].filter(Boolean) : pool;
  return (
    <select
      className={`input slot-select ${value ? "filled" : ""}`}
      value={value ?? ""}
      aria-label={label}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">선수 선택</option>
      {options.map((m) => (
        <option key={m.id} value={m.id} disabled={m.id !== value && used.has(m.id)}>
          {m.name} ({m.gender === "F" ? "여" : "남"} {m.level.toFixed(1)})
        </option>
      ))}
    </select>
  );
}
