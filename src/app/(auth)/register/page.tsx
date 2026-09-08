"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { ExcavatorLogo } from "@/components/excavator-logo";
import { Building2, User, Phone, Mail, Lock, KeyRound, ArrowRight } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch("/api/auth/register", { method: "POST", body: JSON.stringify(body) });
    router.push("/dashboard");
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await run({
      businessName: fd.get("businessName"),
      ownerName: fd.get("ownerName"),
      phone: fd.get("phone"),
      email: fd.get("email"),
      password: fd.get("password"),
      businessCode: fd.get("businessCode") || undefined,
    });
  }

  return (
    <div className="relative overflow-hidden rounded-3xl backdrop-blur-2xl bg-slate-950/65 dark:bg-black/75 border border-white/20 shadow-[0_25px_60px_rgba(0,0,0,0.6)] p-6 sm:p-8">
      {/* Top Brand Centered inside card */}
      <div className="flex flex-col items-center text-center mb-5">
        <div className="flex size-12 items-center justify-center rounded-full bg-amber-500 text-black shadow-lg shadow-amber-500/25 mb-2.5">
          <ExcavatorLogo className="size-7 text-black" />
        </div>
        <p className="text-base font-black text-white leading-tight">
          Excavator <span className="text-amber-400">Manager</span>
        </p>
        <p className="text-[11px] font-medium text-slate-300/80">Smart Fleet Management</p>
      </div>

      {/* Heading */}
      <div className="mb-4 text-left">
        <h2 className="text-2xl font-black text-white tracking-tight">Create Business</h2>
        <p className="text-xs sm:text-sm text-slate-300/85 mt-0.5">
          Set up your fleet management account
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="relative">
          <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4.5 text-slate-400 pointer-events-none" />
          <input
            id="businessName"
            name="businessName"
            type="text"
            required
            autoFocus
            placeholder="Business Name"
            className="w-full h-11 pl-11 pr-4 rounded-xl bg-slate-900/70 border border-slate-700/80 hover:border-slate-500 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 text-white placeholder:text-slate-400 text-sm outline-none transition-all"
          />
        </div>

        <div className="relative">
          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4.5 text-slate-400 pointer-events-none" />
          <input
            id="ownerName"
            name="ownerName"
            type="text"
            required
            placeholder="Your Name (Owner / Manager)"
            className="w-full h-11 pl-11 pr-4 rounded-xl bg-slate-900/70 border border-slate-700/80 hover:border-slate-500 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 text-white placeholder:text-slate-400 text-sm outline-none transition-all"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative">
            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              placeholder="Mobile Number"
              className="w-full h-11 pl-10 pr-3 rounded-xl bg-slate-900/70 border border-slate-700/80 hover:border-slate-500 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 text-white placeholder:text-slate-400 text-sm outline-none transition-all"
            />
          </div>

          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="Email"
              className="w-full h-11 pl-10 pr-3 rounded-xl bg-slate-900/70 border border-slate-700/80 hover:border-slate-500 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 text-white placeholder:text-slate-400 text-sm outline-none transition-all"
            />
          </div>
        </div>

        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4.5 text-slate-400 pointer-events-none" />
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            placeholder="Password (min 6 chars)"
            className="w-full h-11 pl-11 pr-4 rounded-xl bg-slate-900/70 border border-slate-700/80 hover:border-slate-500 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 text-white placeholder:text-slate-400 text-sm outline-none transition-all"
          />
        </div>

        <div className="relative">
          <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4.5 text-slate-400 pointer-events-none" />
          <input
            id="businessCode"
            name="businessCode"
            type="text"
            maxLength={20}
            placeholder="Business Code (Optional)"
            className="w-full h-11 pl-11 pr-4 rounded-xl bg-slate-900/70 border border-slate-700/80 hover:border-slate-500 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 text-white placeholder:text-slate-400 text-sm uppercase outline-none transition-all"
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
          className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-[0.99] text-slate-950 font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 disabled:opacity-60 transition-all cursor-pointer mt-1"
        >
          {pending ? (
            "Creating account..."
          ) : (
            <>
              Create Account <ArrowRight className="size-4.5 stroke-[2.5]" />
            </>
          )}
        </button>
      </form>

      <p className="mt-4 text-center text-xs sm:text-sm text-slate-300/90">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-bold text-amber-400 hover:text-amber-300 underline underline-offset-4 transition-colors"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
