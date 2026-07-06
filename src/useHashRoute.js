import { useState, useEffect } from "react";

// Tiny hash-based router. Hash routing keeps views URL-addressable (and the
// back button working in the installed PWA) without server rewrites, which
// GitHub Pages can't do under the /racked/ base path.
//
// Routes:
//   #/                 workout (also the fallback for anything unrecognized)
//   #/progress         progress & recap
//   #/plan             plan editor
//   #/onboard          plan designer / onboarding
//   #/exercise/<slug>  exercise detail, overlaid on the workout view

export function parseHash(hash) {
  const path = (hash || "").replace(/^#/, "");
  if (path === "/progress") return { view: "progress", exerciseSlug: null };
  if (path === "/plan") return { view: "edit", exerciseSlug: null };
  if (path === "/onboard") return { view: "onboard", exerciseSlug: null };
  const detail = path.match(/^\/exercise\/([^/]+)$/);
  if (detail) return { view: "workout", exerciseSlug: decodeURIComponent(detail[1]) };
  return { view: "workout", exerciseSlug: null };
}

export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Assigning location.hash pushes a history entry, so the browser back
  // button steps between views; navigating to the current hash is a no-op.
  const navigate = (path) => {
    window.location.hash = path;
  };

  return [route, navigate];
}
