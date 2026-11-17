import { useEffect, useState } from "react";

export type Route =
  | { view: "home" }
  | { view: "members" }
  | { view: "draw" }
  | { view: "games"; sessionId?: number }
  | { view: "ranking" };

export function parse(hash: string): Route {
  const [, view, id] = hash.replace(/^#/, "").split("/");
  switch (view) {
    case "members": return { view: "members" };
    case "draw": return { view: "draw" };
    case "games": return { view: "games", sessionId: id ? Number(id) : undefined };
    case "ranking": return { view: "ranking" };
    default: return { view: "home" };
  }
}

export const go = (path: string) => { window.location.hash = path; };

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => { setRoute(parse(window.location.hash)); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
