import { StoreProvider, useStore } from "./store";
import { useRoute } from "./router";
import Home from "./views/Home";
import Members from "./views/Members";
import Draw from "./views/Draw";
import Games from "./views/Games";
import Ranking from "./views/Ranking";

const NAV = [
  { href: "#/", view: "home", label: "홈", icon: "◎" },
  { href: "#/members", view: "members", label: "회원", icon: "☺" },
  { href: "#/draw", view: "draw", label: "대진 작성", icon: "⊞" },
  { href: "#/games", view: "games", label: "경기 기록", icon: "✎" },
  { href: "#/ranking", view: "ranking", label: "순위", icon: "♛" },
] as const;

function Shell() {
  const route = useRoute();
  const { loading, error, reload } = useStore();

  return (
    <div className="app">
      <header className="topbar">
        <a href="#/" className="brand">
          <span className="brand-ball" aria-hidden />
          <span className="brand-text">
            <b>MAHA Club 코트메이트</b>
            <small>COURTMATE · 테니스 동호회 매니저</small>
          </span>
        </a>
        <nav className="nav">
          {NAV.map((n) => (
            <a key={n.view} href={n.href} className={route.view === n.view ? "on" : ""}>
              <span className="nav-icon" aria-hidden>{n.icon}</span>
              <span>{n.label}</span>
            </a>
          ))}
        </nav>
      </header>

      <main className="main">
        {loading ? (
          <div className="loading"><span className="bounce" /> 불러오는 중…</div>
        ) : error ? (
          <div className="card error-card">
            <h3>데이터를 불러오지 못했습니다</h3>
            <p className="muted">{error}</p>
            <button className="btn" onClick={reload}>다시 시도</button>
          </div>
        ) : (
          <>
            {route.view === "home" && <Home />}
            {route.view === "members" && <Members />}
            {route.view === "draw" && <Draw />}
            {route.view === "games" && <Games sessionId={route.sessionId} />}
            {route.view === "ranking" && <Ranking />}
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
