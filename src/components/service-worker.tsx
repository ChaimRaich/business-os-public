"use client";

import { useEffect } from "react";

/** Registers the worker that receives files shared to the installed app (public/sw.js). */
export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        // Without the worker everything works except sharing into the app.
      });
    }
  }, []);
  return null;
}
