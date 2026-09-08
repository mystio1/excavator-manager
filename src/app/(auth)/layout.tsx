"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { ExcavatorLogo } from "@/components/excavator-logo";
import { Mountain, Sun, Moon } from "lucide-react";
import { MODE_STORAGE_KEY } from "@/lib/theme";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    apiFetch("/api/layout")
      .then(() => router.replace("/dashboard"))
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) {
          console.error("Session check failed:", err);
        }
      });
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from a browser-only API unavailable during SSR
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleTheme = (toDark: boolean) => {
    setIsDark(toDark);
    document.documentElement.classList.toggle("dark", toDark);
    localStorage.setItem(MODE_STORAGE_KEY, toDark ? "dark" : "light");
  };

  return (
    <div className="relative min-h-screen lg:h-screen w-full flex flex-col justify-between overflow-x-hidden lg:overflow-hidden text-white select-none">
      {/* Background Images - Ultra Sharp with Soft, Cinematic Cross-Fade */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        {/* Day Background */}
        <div
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            !isDark ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <Image
            src="/login-bg.jpg"
            alt="Excavator quarry landscape daytime"
            fill
            priority
            unoptimized
            className="object-cover object-center"
          />
          {/* Subtle Top-Left Sky Atmosphere Glow for Day */}
          <div className="absolute -top-24 -left-24 w-[450px] h-[350px] bg-gradient-to-br from-sky-500/25 via-blue-600/15 to-transparent blur-[90px] transition-opacity duration-1000" />
          {/* Day Etched Watermark */}
          <div className="hidden lg:block absolute top-[34%] left-[54%] -translate-x-1/2 text-center opacity-30 select-none">
            <p className="text-sm font-black tracking-[0.25em] text-white uppercase drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] leading-tight">
              PEOPLE<br />
              MACHINES<br />
              PROGRESS
            </p>
          </div>
        </div>

        {/* Night Background */}
        <div
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            isDark ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <Image
            src="/login-bg-night.jpg"
            alt="Excavator quarry landscape nighttime"
            fill
            priority
            unoptimized
            className="object-cover object-center"
          />
          {/* Ambient Warm Golden Floodlight & Moon Hue for Night */}
          <div className="absolute -top-20 -left-20 w-[450px] h-[350px] bg-gradient-to-br from-amber-500/15 via-blue-900/20 to-transparent blur-[100px] transition-opacity duration-1000" />
        </div>

        {/* Seamless Grounding shadow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(0,0,0,0.7)_0%,rgba(0,0,0,0.25)_35%,transparent_65%)]" />
        <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
      </div>

      {/* Top Header Bar */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4 sm:px-8 lg:px-12 w-full max-w-[1550px] mx-auto shrink-0">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex size-10 items-center justify-center rounded-full bg-amber-500 text-black shadow-lg shadow-amber-500/40 transition-transform group-hover:scale-105">
            <ExcavatorLogo className="size-6 text-black" />
          </div>
          <div className="flex flex-col drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
            <span className="text-lg font-black tracking-tight text-white leading-tight">
              Excavator <span className="text-amber-400 font-extrabold">Manager</span>
            </span>
            <span className="text-[9.5px] font-bold tracking-[0.25em] text-slate-100 uppercase">
              Smart Fleet Management
            </span>
          </div>
        </Link>

        {/* Soft Sliding Theme Switch Capsule Pill */}
        <div
          onClick={() => toggleTheme(!isDark)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") toggleTheme(!isDark);
          }}
          aria-label="Toggle light or dark theme"
          className="relative flex items-center bg-slate-900/70 backdrop-blur-md border border-white/30 rounded-full p-1 shadow-xl w-[70px] h-9 cursor-pointer"
        >
          {/* Smooth Sliding Yellow Indicator */}
          <div
            className={`absolute top-1 bottom-1 w-[29px] rounded-full bg-amber-500 shadow-md transition-transform duration-500 ease-out ${
              isDark ? "translate-x-[33px]" : "translate-x-0"
            }`}
          />

          {/* Sun Icon (Day) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleTheme(false);
            }}
            aria-label="Light mode"
            className={`relative z-10 flex items-center justify-center size-7 rounded-full transition-colors duration-300 ${
              !isDark ? "text-black font-bold" : "text-slate-300 hover:text-white"
            }`}
          >
            <Sun className="size-3.5 stroke-[2.5]" />
          </button>

          {/* Moon Icon (Night) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleTheme(true);
            }}
            aria-label="Dark mode"
            className={`relative z-10 flex items-center justify-center size-7 rounded-full transition-colors duration-300 ${
              isDark ? "text-black font-bold" : "text-slate-300 hover:text-white"
            }`}
          >
            <Moon className="size-3.5 stroke-[2.5]" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 flex items-center justify-between px-6 sm:px-8 lg:px-12 w-full max-w-[1550px] mx-auto py-2 lg:py-0 min-h-0">
        <div className="w-full flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-6">
          {/* Left Column: Hero Brand Content */}
          <div className="w-full lg:w-[350px] shrink-0 flex flex-col justify-start text-left lg:-mt-20 py-1">
            <div className="inline-flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold tracking-[0.3em] uppercase text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                People &nbsp;|&nbsp; Machines &nbsp;|&nbsp; Progress
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-[2.65rem] font-black tracking-tight text-white leading-[1.02] uppercase drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)]">
              Built <br />
              For A <br />
              <span className="text-amber-400 drop-shadow-[0_4px_24px_rgba(245,158,11,0.7)]">Bigger</span> <br />
              Tomorrow
            </h1>

            <div className="mt-3.5 space-y-0.5 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">
              <p className="text-xs sm:text-sm font-bold text-white tracking-wide">
                Track. Manage. Maintain. Optimize.
              </p>
              <p className="text-[11px] sm:text-xs font-medium text-slate-100">
                Your excavators, your way.
              </p>
            </div>

            {/* 3 Value Pillars Badges */}
            <div className="mt-8 lg:mt-10 flex items-start gap-4 sm:gap-6 max-w-sm">
              {/* Pillar 1: Productivity */}
              <div className="flex flex-col gap-1.5 drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]">
                <svg className="size-4 text-white stroke-[2.2]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <line x1="18" y1="20" x2="18" y2="4" strokeLinecap="round" />
                  <line x1="12" y1="20" x2="12" y2="10" strokeLinecap="round" />
                  <line x1="6" y1="20" x2="6" y2="15" strokeLinecap="round" />
                </svg>
                <div>
                  <p className="text-[11px] font-bold text-white leading-tight">Higher</p>
                  <p className="text-[10px] font-normal text-slate-200 leading-tight">Productivity</p>
                </div>
              </div>

              {/* Divider */}
              <div className="w-[1px] h-8 bg-white/20 self-center" />

              {/* Pillar 2: Safety */}
              <div className="flex flex-col gap-1.5 drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]">
                <svg className="size-4 text-white stroke-[2.2]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div>
                  <p className="text-[11px] font-bold text-white leading-tight">Safer</p>
                  <p className="text-[10px] font-normal text-slate-200 leading-tight">Operations</p>
                </div>
              </div>

              {/* Divider */}
              <div className="w-[1px] h-8 bg-white/20 self-center" />

              {/* Pillar 3: Greener */}
              <div className="flex flex-col gap-1.5 drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]">
                <svg className="size-4 text-white stroke-[2.2]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M11 20A7 7 0 0 1 4 13C4 7 11 3 20 3c0 9-4 16-11 16z" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M7 17l6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div>
                  <p className="text-[11px] font-bold text-white leading-tight">Greener</p>
                  <p className="text-[10px] font-normal text-slate-200 leading-tight">Tomorrow</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Glass Card Container */}
          <div className="w-full lg:w-[380px] flex justify-center lg:justify-end shrink-0">
            <div className="w-full max-w-[380px] animate-fade-in-up">
              {children}
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Footer Bar */}
      <footer className="relative z-20 flex flex-col sm:flex-row items-center justify-between gap-2 px-6 py-3.5 sm:px-8 lg:px-12 w-full max-w-[1550px] mx-auto text-[10px] font-bold tracking-[0.2em] uppercase text-white/90 drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="h-[2.5px] w-7 bg-amber-500 rounded-full inline-block shadow-sm" />
          <span>Fleets that build a better tomorrow</span>
        </div>

        <div className="flex items-center gap-2 text-white/90">
          <Mountain className="size-3.5 text-white stroke-[2]" />
          <span>Excavate &nbsp;|&nbsp; Operate &nbsp;|&nbsp; Transform</span>
        </div>
      </footer>
    </div>
  );
}
