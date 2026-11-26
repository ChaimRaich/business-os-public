"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "bos-theme";
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function getServerSnapshot() {
  return null;
}

export function ThemeToggle({ className = "", showLabel = false }: { className?: string; showLabel?: boolean }) {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = !(dark ?? false);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Ignore storage failures in private browsing.
    }
    listeners.forEach((listener) => listener());
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "מעבר למצב בהיר" : "מעבר למצב כהה"}
      title={dark ? "מצב בהיר" : "מצב כהה"}
      className={`inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-muted transition-all hover:border-line-strong hover:bg-surface-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
    >
      {dark === null ? (
        <span className="size-4" aria-hidden />
      ) : dark ? (
        <Sun className="size-4 text-amber-400" aria-hidden />
      ) : (
        <Moon className="size-4" aria-hidden />
      )}
      {showLabel && <span>{dark === null ? "ערכת נושא" : dark ? "מצב בהיר" : "מצב כהה"}</span>}
    </button>
  );
}
