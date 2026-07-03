import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import AuthGate from "./AuthGate.jsx";
import RackedTracker from "./RackedTracker.jsx";

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthGate>{(session) => <RackedTracker session={session} />}</AuthGate>
  </React.StrictMode>
);
