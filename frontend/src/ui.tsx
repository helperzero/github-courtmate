import type { ReactNode } from "react";
import type { Member } from "./types";
import type { Result } from "./stats";

export function Avatar({ m, size = 32 }: { m?: Member; size?: number }) {
  if (!m) return <span className="avatar" style={{ width: size, height: size }}>?</span>;
  return (
    <span className={`avatar ${m.gender === "F" ? "avatar-f" : "avatar-m"}`} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {m.name.slice(-2)}
    </span>
  );
}

export function PlayerTag({ m, onClick, active, dim }: { m?: Member; onClick?: () => void; active?: boolean; dim?: boolean }) {
  const cls = `player-tag ${active ? "is-active" : ""} ${dim ? "is-dim" : ""} ${onClick ? "is-click" : ""}`;
  const inner = (
    <>
      <Avatar m={m} size={24} />
      <span className="player-name">{m?.name ?? "알 수 없음"}</span>
      {m && <span className="player-lvl">{m.level.toFixed(1)}</span>}
    </>
  );
  return onClick ? (
    <button type="button" className={cls} onClick={onClick}>{inner}</button>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-ball" aria-hidden />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function PageHead({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <div className="kicker">{kicker}</div>
        <h1>{title}</h1>
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}

export function Form({ form }: { form: Result[] }) {
  if (!form.length) return <span className="muted">-</span>;
  return (
    <span className="form">
      {form.map((f, i) => <i key={i} className={f === "W" ? "w" : f === "D" ? "d" : "l"}>{f === "W" ? "승" : f === "D" ? "무" : "패"}</i>)}
    </span>
  );
}
