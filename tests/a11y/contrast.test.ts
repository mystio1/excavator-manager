import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WCAG 2.2 AA colour-contrast guard for the theme tokens in globals.css.
 *
 * It parses the real CSS custom properties (so a token tweak that breaks a
 * pairing fails here instead of in a user's eyes) and checks the pairings the
 * UI actually uses: text on its surfaces, text on the translucent status/
 * destructive tints, solid status badges, and the 3:1 non-text contrast of
 * form-control borders and the focus ring.
 *
 * DB-free: `npx vitest run tests/a11y`.
 */

type Rgba = { r: number; g: number; b: number; a: number };

const CSS = readFileSync(path.resolve(__dirname, "../../src/app/globals.css"), "utf8");

function blockVars(selector: RegExp): Record<string, string> {
  const out: Record<string, string> = {};
  const re = new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`, "g");
  for (const block of CSS.matchAll(re)) {
    for (const decl of block[1].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) out[decl[1]] = decl[2].trim();
  }
  return out;
}

const LIGHT = blockVars(/(?<![\w.])\:root/);
const DARK = { ...LIGHT, ...blockVars(/\.dark/) };

function parseColor(value: string): Rgba {
  const v = value.trim();
  let m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/);
  if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) };
  throw new Error(`Unsupported colour: ${value}`);
}

/** `fg` painted at `alpha` (default: its own alpha) on top of an opaque `bg`. */
function over(fg: Rgba, bg: Rgba, alpha = fg.a): Rgba {
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
    a: 1,
  };
}

function channel(v: number) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
const luminance = (c: Rgba) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);

function contrast(a: Rgba, b: Rgba) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function headerStops(vars: Record<string, string>): Rgba[] {
  const bg = vars["header-bg"];
  return [...bg.matchAll(/#[0-9a-f]{6}/gi)].map((m) => parseColor(m[0]));
}

const MODES = [
  ["light", LIGHT],
  ["dark", DARK],
] as const;

describe("globals.css tokens exist and parse", () => {
  it.each(MODES)("%s theme", (_name, vars) => {
    for (const t of [
      "background", "foreground", "card", "popover", "muted", "muted-foreground", "primary", "primary-foreground",
      "primary-text", "secondary", "secondary-foreground", "accent", "accent-foreground", "destructive",
      "working", "working-foreground", "service", "service-foreground", "info", "info-foreground", "purple",
      "purple-foreground", "idle", "idle-foreground", "control-border", "ring", "sidebar", "header-bg",
    ]) {
      expect(vars[t], `--${t} missing`).toBeTruthy();
    }
  });
});

describe.each(MODES)("WCAG AA contrast of the %s theme", (_name, vars) => {
  const tok = (n: string) => parseColor(vars[n]);
  const surfaces = ["background", "card", "popover", "muted", "secondary", "sidebar"] as const;
  const page = tok("background");
  const card = tok("card");

  function expectText(label: string, fg: Rgba, bg: Rgba, min = 4.5) {
    const ratio = contrast(fg, bg);
    expect(ratio, `${label}: ${ratio.toFixed(2)}:1 (needs ${min}:1)`).toBeGreaterThanOrEqual(min);
  }

  it.each(surfaces)("foreground and muted-foreground are readable on %s", (surface) => {
    expectText(`foreground/${surface}`, tok("foreground"), tok(surface));
    expectText(`muted-foreground/${surface}`, tok("muted-foreground"), tok(surface));
  });

  it("text is readable on the top-bar gradient", () => {
    for (const stop of headerStops(vars)) {
      expectText("foreground/header", tok("foreground"), stop);
      expectText("muted-foreground/header", tok("muted-foreground"), stop);
      expectText("primary-text/header", tok("primary-text"), stop);
    }
  });

  it("muted-foreground is readable on the accent wash", () => {
    expectText("muted-foreground/accent", tok("muted-foreground"), over(tok("accent"), card));
  });

  it("primary button text, secondary and accent text", () => {
    expectText("primary-foreground/primary", tok("primary-foreground"), tok("primary"));
    expectText("primary-foreground/primary hover", tok("primary-foreground"), over(tok("primary"), page, 0.8));
    expectText("secondary-foreground/secondary", tok("secondary-foreground"), tok("secondary"));
    for (const under of [card, page, tok("sidebar")]) {
      expectText("accent-foreground/accent", tok("accent-foreground"), over(tok("accent"), under));
      expectText("sidebar-accent-foreground", tok("sidebar-accent-foreground"), over(tok("sidebar-accent"), under));
    }
  });

  it("primary-text (amber used as text) is readable on every surface and on its own tint", () => {
    for (const s of surfaces) expectText(`primary-text/${s}`, tok("primary-text"), tok(s));
    for (const under of [card, page]) {
      for (const alpha of [0.08, 0.1, 0.12, 0.18]) {
        expectText(`primary-text/primary@${alpha}`, tok("primary-text"), over(tok("primary"), under, alpha));
      }
    }
  });

  it("destructive text on surfaces and on its translucent tints", () => {
    for (const s of ["background", "card", "popover", "muted"] as const) {
      expectText(`destructive/${s}`, tok("destructive"), tok(s));
    }
    const under = [card, page, tok("popover")];
    // 8/10/12/15 are the resting tints used by banners, badges and buttons; the
    // hover tint (20) is only required against cards (where it is used).
    for (const alpha of [0.08, 0.1, 0.12, 0.15]) {
      for (const u of under) expectText(`destructive/destructive@${alpha}`, tok("destructive"), over(tok("destructive"), u, alpha));
    }
    expectText("destructive/destructive@20 on card", tok("destructive"), over(tok("destructive"), card, 0.2));
  });

  it.each(["working", "service", "info", "purple"] as const)("%s colour: solid badge and tinted text", (name) => {
    expectText(`${name}-foreground/${name}`, tok(`${name}-foreground`), tok(name));
    expectText(`${name}/card`, tok(name), card);
    expectText(`${name}/background`, tok(name), page);
    for (const alpha of [0.05, 0.12, 0.15]) {
      expectText(`${name}/${name}@${alpha} on card`, tok(name), over(tok(name), card, alpha));
    }
    expectText(`${name}/${name}@12 on background`, tok(name), over(tok(name), page, 0.12));
  });

  it("idle (amber) chips, banners and text", () => {
    const idle = tok("idle");
    for (const u of [card, page, tok("muted")]) expectText("idle-foreground/idle", tok("idle-foreground"), over(idle, u));
    expectText("idle-foreground/idle@60 banner", tok("idle-foreground"), over(idle, card, idle.a * 0.6));
    expectText("idle-foreground/card", tok("idle-foreground"), card);
    expectText("idle-foreground/background", tok("idle-foreground"), page);
    expectText("idle-foreground/idle-foreground@15 icon chip", tok("idle-foreground"), over(tok("idle-foreground"), card, 0.15));
  });

  it("form-control borders and the focus ring meet 3:1 (WCAG 1.4.11)", () => {
    for (const s of ["background", "card", "popover"] as const) {
      expectText(`control-border/${s}`, tok("control-border"), tok(s), 3);
      expectText(`ring/${s}`, tok("ring"), tok(s), 3);
    }
  });
});
