"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { ExcavatorLogo } from "@/components/excavator-logo";
import { Mail, ArrowRight, ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const { error, pending, run } = useApiForm(async (email: string) => {
    await apiFetch("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
    setSubmitted(true);
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = new FormData(e.currentTarget).get("email") as string;
    await run(email);
  }

  if (submitted) {
    return (
      <div className="relative overflow-hidden rounded-3xl backdrop-blur-2xl bg-slate-950/65 dark:bg-black/75 border border-white/20 shadow-[0_25px_60px_rgba(0,0,0,0.6)] p-6 sm:p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="flex size-12 items-center justify-center rounded-full bg-amber-500 text-black shadow-lg shadow-amber-500/25 mb-2.5">
            <ExcavatorLogo className="size-7 text-black" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">Check Your Email</h2>
          <p className="text-xs sm:text-sm text-slate-300/85 mt-2">
            If that email is registered, we&rsquo;ve sent a link to reset your password. It&rsquo;s valid for 1 hour.
          </p>
        </div>

        <Link
          href="/login"
          className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-[0.99] text-slate-950 font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition-all"
        >
          <ArrowLeft className="size-4.5 stroke-[2.5]" /> Back to Log In
        </Link>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl backdrop-blur-2xl bg-slate-950/65 dark:bg-black/75 border border-white/20 shadow-[0_25px_60px_rgba(0,0,0,0.6)] p-6 sm:p-8">
      {/* Top Brand Centered inside card */}
      <div className="flex flex-col items-center text-center mb-6">
        <div className="flex size-12 items-center justify-center rounded-full bg-amber-500 text-black shadow-lg shadow-amber-500/25 mb-2.5">
          <ExcavatorLogo className="size-7 text-black" />
        </div>
        <p className="text-base font-black text-white leading-tight">
          Excavator <span className="text-amber-400">Manager</span>
        </p>
        <p className="text-[11px] font-medium text-slate-300/80">Smart Fleet Management</p>
      </div>

      {/* Heading */}
      <div className="mb-5 text-left">
        <h2 className="text-2xl font-black text-white tracking-tight">Forgot Password</h2>
        <p className="text-xs sm:text-sm text-slate-300/85 mt-0.5">
          Enter your registered email and we&rsquo;ll send you a password reset link.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="relative">
          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4.5 text-slate-400 pointer-events-none" />
          <input
            id="email"
            name="email"
            type="email"
            required
            autoFocus
            placeholder="Registered email address"
            className="w-full h-12 pl-11 pr-4 rounded-xl bg-slate-900/70 border border-slate-700/80 hover:border-slate-500 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 text-white placeholder:text-slate-400 text-sm outline-none transition-all"
          />
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/20 border border-red-500/40 px-3 py-2 text-xs font-medium text-red-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-[0.99] text-slate-950 font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 disabled:opacity-60 transition-all cursor-pointer"
        >
          {pending ? (
            "Sending..."
          ) : (
            <>
              Send Reset Link <ArrowRight className="size-4.5 stroke-[2.5]" />
            </>
          )}
        </button>
      </form>

      <p className="mt-5 text-center text-xs sm:text-sm text-slate-300/90">
        Remembered your password?{" "}
        <Link
          href="/login"
          className="font-bold text-amber-400 hover:text-amber-300 underline underline-offset-4 transition-colors"
        >
          Back to log in
        </Link>
      </p>
    </div>
  );
}
