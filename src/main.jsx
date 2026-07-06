import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import AuthGate from "./AuthGate.jsx";
import { AppStateProvider } from "./AppState.jsx";
import { setStorageScope } from "./storageScope.js";
import RackedTracker from "./RackedTracker.jsx";

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthGate>
      {(session) => {
        // Scope the offline queue / snapshot / flags to this account before
        // anything storage-backed mounts (idempotent, so re-renders are free).
        setStorageScope(session.user.id);
        return (
          <AppStateProvider>
            <RackedTracker session={session} />
          </AppStateProvider>
        );
      }}
    </AuthGate>
  </React.StrictMode>
);
