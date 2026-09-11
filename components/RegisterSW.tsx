"use client";

import { useEffect } from "react";

// Registers the service worker in production builds only. In development a
// service worker would serve stale chunks and get in the way of hot reload.
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service worker registration failed", err);
    });
  }, []);
  return null;
}
