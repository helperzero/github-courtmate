import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { api } from "./api";
import type { Match, Member, Session } from "./types";

interface Store {
  members: Member[];
  sessions: Session[];
  matches: Match[];
  loading: boolean;
  error: string | null;
  memberById: Map<number, Member>;
  reload: () => Promise<void>;
  setMatches: Dispatch<SetStateAction<Match[]>>;
  toast: (msg: string, kind?: "ok" | "err") => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: "ok" | "err" }[]>([]);

  const reload = useCallback(async () => {
    try {
      const [m, s, x] = await Promise.all([api.members(), api.sessions(), api.matches()]);
      setMembers(m);
      setSessions(s);
      setMatches(x);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const toast = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  return (
    <Ctx.Provider value={{ members, sessions, matches, loading, error, memberById, reload, setMatches, toast }}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>{t.msg}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider missing");
  return s;
};
