import { useMemo, useState, type FormEvent } from "react";
import { api, type MemberInput } from "../api";
import { useStore } from "../store";
import { computeStats, pct, today } from "../stats";
import type { Member } from "../types";
import { Avatar, Empty, Form, PageHead } from "../ui";

const blank = (): MemberInput => ({ name: "", gender: "M", level: 3.0, phone: "", memo: "", active: true, joinedAt: today() });

export default function Members() {
  const { members, matches, sessions, reload, toast } = useStore();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"active" | "all" | "inactive">("active");
  const [editing, setEditing] = useState<{ id?: number; data: MemberInput } | null>(null);
  const [saving, setSaving] = useState(false);

  const stats = useMemo(() => new Map(computeStats(members, matches, sessions).map((s) => [s.member.id, s])), [members, matches, sessions]);

  const list = members
    .filter((m) => (filter === "all" ? true : filter === "active" ? m.active : !m.active))
    .filter((m) => !q || m.name.includes(q.trim()) || m.phone.includes(q.trim()))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const counts = {
    m: members.filter((m) => m.active && m.gender === "M").length,
    f: members.filter((m) => m.active && m.gender === "F").length,
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      if (editing.id) await api.updateMember(editing.id, editing.data);
      else await api.createMember(editing.data);
      toast(editing.id ? "회원 정보를 수정했어요" : `${editing.data.name} 님을 등록했어요`);
      setEditing(null);
      await reload();
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (m: Member) => {
    if (!confirm(`${m.name} 님을 삭제할까요?\n경기 기록이 있으면 기록 보존을 위해 휴면 회원으로 전환됩니다.`)) return;
    try {
      const r = await api.deleteMember(m.id);
      toast(r.archived ? `${m.name} 님을 휴면 처리했어요` : `${m.name} 님을 삭제했어요`);
      setEditing(null);
      await reload();
    } catch (err) {
      toast((err as Error).message, "err");
    }
  };

  const addSamples = async () => {
    const SAMPLE: [string, "M" | "F", number][] = [
      ["김민준", "M", 4.0], ["이서연", "F", 3.5], ["박도윤", "M", 3.5], ["최지우", "F", 3.0],
      ["정하준", "M", 4.5], ["강수아", "F", 4.0], ["조예준", "M", 3.0], ["윤하은", "F", 2.5],
      ["장시우", "M", 3.5], ["임지민", "F", 3.5], ["한주원", "M", 2.5], ["오채원", "F", 3.0],
    ];
    setSaving(true);
    try {
      for (const [name, gender, level] of SAMPLE) {
        await api.createMember({ ...blank(), name, gender, level });
      }
      toast("샘플 회원 12명을 추가했어요");
      await reload();
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof MemberInput>(k: K, v: MemberInput[K]) =>
    setEditing((e) => (e ? { ...e, data: { ...e.data, [k]: v } } : e));

  return (
    <div className="stack">
      <PageHead kicker="Members" title="회원 관리">
        <button className="btn btn-primary" onClick={() => setEditing({ data: blank() })}>+ 회원 등록</button>
      </PageHead>

      <div className="toolbar">
        <input className="input search" placeholder="이름 또는 연락처 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          {(["active", "inactive", "all"] as const).map((f) => (
            <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f === "active" ? "활동" : f === "inactive" ? "휴면" : "전체"}
            </button>
          ))}
        </div>
        <span className="muted small">활동 회원 남 {counts.m} · 여 {counts.f}</span>
      </div>

      {list.length === 0 ? (
        <Empty
          title={members.length ? "조건에 맞는 회원이 없어요" : "첫 회원을 등록해 보세요"}
          action={
            !members.length && (
              <div className="btn-row" style={{ justifyContent: "center" }}>
                <button className="btn btn-primary" onClick={() => setEditing({ data: blank() })}>+ 회원 등록</button>
                <button className="btn" disabled={saving} onClick={addSamples}>{saving ? "추가 중…" : "샘플 회원 12명으로 시작"}</button>
              </div>
            )
          }
        >
          {!members.length && "이름, 성별, NTRP 실력만 입력하면 대진 작성에 바로 사용할 수 있어요."}
        </Empty>
      ) : (
        <div className="member-grid">
          {list.map((m) => {
            const s = stats.get(m.id);
            return (
              <button key={m.id} className={`member-card ${m.active ? "" : "is-inactive"}`} onClick={() => setEditing({ id: m.id, data: { ...m } })}>
                <div className="member-top">
                  <Avatar m={m} size={44} />
                  <div className="grow">
                    <b>{m.name}</b>
                    <small className="muted">{m.gender === "F" ? "여" : "남"} · 가입 {m.joinedAt.slice(0, 7).replace("-", ".")}</small>
                  </div>
                  <span className="ntrp">{m.level.toFixed(1)}</span>
                </div>
                <div className="member-stats">
                  <span><b>{s?.wins ?? 0}</b>승</span>
                  {(s?.draws ?? 0) > 0 && <span><b>{s!.draws}</b>무</span>}
                  <span><b>{s?.losses ?? 0}</b>패</span>
                  <span><b>{s?.games ? pct(s.winRate) : "-"}</b></span>
                  <Form form={s?.form ?? []} />
                </div>
                {m.memo && <p className="memo">{m.memo}</p>}
                {!m.active && <span className="badge">휴면</span>}
              </button>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="modal-bg" onClick={() => setEditing(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h2>{editing.id ? "회원 정보 수정" : "새 회원 등록"}</h2>
            <label className="field">
              <span>이름</span>
              <input className="input" autoFocus required maxLength={40} value={editing.data.name} onChange={(e) => set("name", e.target.value)} />
            </label>
            <div className="row">
              <div className="field">
                <span>성별</span>
                <div className="seg">
                  <button type="button" className={editing.data.gender === "M" ? "on" : ""} onClick={() => set("gender", "M")}>남</button>
                  <button type="button" className={editing.data.gender === "F" ? "on" : ""} onClick={() => set("gender", "F")}>여</button>
                </div>
              </div>
              <label className="field grow">
                <span>실력 (NTRP) <b className="ntrp-inline">{editing.data.level.toFixed(1)}</b></span>
                <input type="range" min={1} max={7} step={0.5} value={editing.data.level} onChange={(e) => set("level", Number(e.target.value))} />
              </label>
            </div>
            <div className="row">
              <label className="field grow">
                <span>연락처</span>
                <input className="input" inputMode="tel" placeholder="010-0000-0000" value={editing.data.phone} onChange={(e) => set("phone", e.target.value)} />
              </label>
              <label className="field">
                <span>가입일</span>
                <input className="input" type="date" value={editing.data.joinedAt} onChange={(e) => set("joinedAt", e.target.value)} />
              </label>
            </div>
            <label className="field">
              <span>메모</span>
              <textarea className="input" rows={2} placeholder="포핸드 강함, 주말 참석 위주 등" value={editing.data.memo} onChange={(e) => set("memo", e.target.value)} />
            </label>
            <label className="check">
              <input type="checkbox" checked={editing.data.active} onChange={(e) => set("active", e.target.checked)} />
              <span>활동 회원 (대진 작성 시 참석자 목록에 표시)</span>
            </label>
            <div className="modal-actions">
              {editing.id && (
                <button type="button" className="btn btn-danger-ghost" onClick={() => remove(members.find((m) => m.id === editing.id)!)}>삭제</button>
              )}
              <span className="grow" />
              <button type="button" className="btn" onClick={() => setEditing(null)}>취소</button>
              <button className="btn btn-primary" disabled={saving}>{saving ? "저장 중…" : "저장"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
