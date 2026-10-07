"use client";

import { useEffect } from "react";

const APP_NAME = "Excavator Manager";

/**
 * Gives the current screen a meaningful document title ("Settings |
 * Excavator Manager") — WCAG 2.4.2. Every page here is a client component, so
 * it can't export Next.js `metadata`; the app-wide default title stays in the
 * root layout and this refines it while the screen is mounted. The previous
 * title is restored on unmount so a screen without its own title (or an
 * error page) never shows a stale one.
 */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} | ${APP_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

/**
 * Keeps <html lang> in step with the language the screen is actually shown in
 * (WCAG 3.1.1) — the operator portal can be English, Hindi or Marathi per
 * operator, while the root layout can only declare one static value. Restores
 * "en" on unmount.
 */
export function useDocumentLang(lang: string | null | undefined) {
  useEffect(() => {
    if (!lang) return;
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = "en";
    };
  }, [lang]);
}

/** Same as usePageTitle, for server-rendered or hook-free spots. */
export function PageTitle({ title }: { title: string | null | undefined }) {
  usePageTitle(title);
  return null;
}
