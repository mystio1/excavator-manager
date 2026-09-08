"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { ExcavatorLogo } from "@/components/excavator-logo";
import { Mail, Lock, Eye, EyeOff, ArrowRight, HardHat, ChevronRight } from "lucide-react";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justReset = searchParams.get("reset") === "1";
  const [showPassword, setShowPassword] = useState(false);

  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify(body) });
    router.push("/dashboard");
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await run({ identifier: fd.get("identifier"), password: fd.get("password") });
  }

  return (
    <div className="relative overflow-hidden rounded-[2.2rem] backdrop-blur-3xl bg-slate-950/80 border border-white/25 shadow-[0_25px_60px_rgba(0,0,0,0.55)] p-6 sm:p-7 text-white">
      {/* Topographic Contour Wave SVG Pattern on top right */}
      <svg
        className="absolute -top-6 -right-6 w-44 h-44 pointer-events-none opacity-20 text-sky-200"
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M20 180 C 70 130, 110 150, 180 80" stroke="currentColor" strokeWidth="1.2" />
        <path d="M45 190 C 90 120, 130 130, 190 60" stroke="currentColor" strokeWidth="1.2" />
        <path d="M70 200 C 110 110, 150 110, 200 40" stroke="currentColor" strokeWidth="1.2" />
        <path d="M95 200 C 130 100, 170 90, 200 20" stroke="currentColor" strokeWidth="1.2" />
        <path d="M120 200 C 150 90, 185 70, 200 0" stroke="currentColor" strokeWidth="1.2" />
      </svg>

      {/* Top Brand Centered inside card */}
      <div className="flex flex-col items-center text-center mb-4">
        <div className="flex size-11 items-center justify-center rounded-full bg-amber-500 text-black shadow-lg shadow-amber-500/35 mb-2">
          <ExcavatorLogo className="size-6 text-black" />
        </div>
        <p className="text-base font-black text-white leading-tight">
          Excavator <span className="text-amber-400">Manager</span>
        </p>
        <p className="text-[11px] font-medium text-slate-200">Smart Fleet Management</p>
      </div>

      {/* Welcome Heading */}
      <div className="mb-4 text-left">
        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">Welcome Back</h2>
        <p className="text-xs sm:text-sm text-slate-200/90 mt-0.5">
          Log in to continue managing your fleet
        </p>
      </div>

      {justReset && (
        <div className="mb-3 rounded-xl bg-amber-500/20 border border-amber-500/40 px-3 py-2 text-xs font-semibold text-amber-300">
          Password reset successfully — log in with your new password.
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {/* Identifier field */}
        <div className="relative">
          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-300 pointer-events-none" />
          <input
            id="identifier"
            name="identifier"
            type="text"
            required
            autoFocus
            placeholder="Email or phone number"
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-slate-900/80 border border-white/20 hover:border-white/40 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40 text-white placeholder:text-slate-400 text-sm outline-none transition-all"
          />
        </div>

        {/* Password field */}
        <div className="flex flex-col gap-1">
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-300 pointer-events-none" />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              placeholder="Password"
              className="w-full h-11 pl-10 pr-10 rounded-xl bg-slate-900/80 border border-white/20 hover:border-white/40 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40 text-white placeholder:text-slate-400 text-sm outline-none transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-white transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>

          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/25 border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-200">
            {error}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={pending}
          className="w-full h-11 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-[0.99] text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/30 disabled:opacity-60 transition-all cursor-pointer mt-0.5"
        >
          {pending ? (
            "Logging in..."
          ) : (
            <>
              Log In <ArrowRight className="size-4 stroke-[2.5]" />
            </>
          )}
        </button>
      </form>

      {/* New here link */}
      <p className="mt-3 text-center text-xs text-slate-200">
        New here?{" "}
        <Link
          href="/register"
          className="font-bold text-amber-400 hover:text-amber-300 underline underline-offset-4 transition-colors"
        >
          Create your business account
        </Link>
      </p>

      {/* OR Divider */}
      <div className="relative flex items-center justify-center my-3">
        <div className="border-t border-white/20 w-full" />
        <span className="absolute bg-slate-950 px-2 py-0.5 text-[9.5px] font-bold text-slate-300 tracking-wider uppercase rounded-full border border-white/15">
          OR
        </span>
      </div>

      {/* Operator Login Banner */}
      <Link
        href="/operator-login"
        className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/25 transition-all group backdrop-blur-sm"
      >
        <div className="flex items-center gap-2">
          <div className="flex size-6.5 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <HardHat className="size-3.5" />
          </div>
          <span className="text-xs text-white font-medium">Are you an operator?</span>
        </div>
        <span className="text-xs font-bold text-amber-400 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
          Log in here <ChevronRight className="size-3" />
        </span>
      </Link>
    </div>
  );
}
