export type ColorMode = "light" | "dark" | "system";

export const MODE_STORAGE_KEY = "excavator-color-mode";
export const DEFAULT_MODE: ColorMode = "dark";

/** Inlined into a <script> in the root layout so dark mode applies before
 * first paint — avoids a flash of the wrong mode on load. */
export const NO_FLASH_THEME_SCRIPT = `
(function () {
  try {
    var mode = localStorage.getItem("${MODE_STORAGE_KEY}") || "${DEFAULT_MODE}";
    var dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();
`;
