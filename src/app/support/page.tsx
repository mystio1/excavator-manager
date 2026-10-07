"use client";

import { useEffect, useState } from "react";
import { AlertCircle, KeyRound, LogOut, Search, Shield, Snowflake, Trash2, User, X } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { usePageTitle } from "@/components/page-title";

const TOKEN_KEY = "excavator_support_token";

/** Every support action that touches a business must say why; the server
 * requires it too and stores it in that business's audit log. */
const MIN_REASON = 5;
const reasonOk = (reason: string) => reason.trim().length >= MIN_REASON;

function ReasonField({ id, value, onChange, disabled }: { id: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-sm">
        Reason (recorded in the audit log)
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={500}
        placeholder="e.g. owner asked us to fix a bill"
        className="h-11"
        disabled={disabled}
      />
    </div>
  );
}

type Business = {
  id: string;
  code: string;
  name: string;
  createdAt: string;
  frozen: boolean;
  maxOperators: number | null;
  maxBillsPerDay: number | null;
  userCount: number;
  operatorCount: number;
  customerCount: number;
  excavatorCount: number;
  billsToday: number;
};

// Not linked from anywhere in the owner/operator-facing UI — reachable only
// by navigating straight here. Entirely separate credential from any
// business's own login: a single shared password (SUPPORT_ACCESS_PASSWORD
// on the server) opens a one-hour support session (an opaque token the server
// checks against its database on every call, and can revoke) that can list
// every business and open any of them as their admin, for remote
// troubleshooting.
export default function SupportConsolePage() {
  usePageTitle("Support console");
  const [token, setToken] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from a browser-only API unavailable during SSR
    setToken(sessionStorage.getItem(TOKEN_KEY));
    setHydrated(true);
  }, []);

  function handleLoggedIn(t: string) {
    sessionStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  }

  // The session already ended server-side (expired / revoked): just forget the token.
  function handleExpired() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }

  // "Exit Support Mode" revokes the session on the server too, so the token is
  // dead everywhere the moment this is clicked — not merely forgotten here.
  async function handleExit() {
    const current = token;
    handleExpired();
    if (!current) return;
    try {
      await apiFetch("/api/support/logout", { method: "POST", headers: { Authorization: `Bearer ${current}` } });
    } catch {
      // Best effort — an unreachable server can't have honoured the token anyway,
      // and it expires on its own within the hour.
    }
  }

  if (!hydrated) return null;

  return token ? (
    <BusinessDirectory token={token} onExit={handleExit} onExpired={handleExpired} />
  ) : (
    <SupportLogin onLoggedIn={handleLoggedIn} />
  );
}

function SupportLogin({ onLoggedIn }: { onLoggedIn: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) {
      setError("Enter the support password");
      return;
    }
    setPending(true);
    setError("");
    try {
      const { token } = await apiFetch<{ token: string }>("/api/support/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      onLoggedIn(token);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Could not log in");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-4 py-6">
          <div className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary-text" />
            <h1 className="text-xl font-extrabold">Support Console</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Internal tool — access any business&rsquo;s admin account for remote troubleshooting.
          </p>
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="support-password" className="text-sm">
                Support Password
              </Label>
              <Input
                id="support-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11"
                autoFocus
                disabled={pending}
              />
            </div>
            {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
            <Button type="submit" size="lg" className="h-11" disabled={pending}>
              {pending ? "Checking..." : "Log In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function BusinessDirectory({
  token,
  onExit,
  onExpired,
}: {
  token: string;
  onExit: () => void;
  onExpired: () => void;
}) {
  const [businesses, setBusinesses] = useState<Business[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");

  async function load() {
    try {
      const { businesses } = await apiFetch<{ businesses: Business[] }>("/api/support/businesses", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBusinesses(businesses);
    } catch (err) {
      // An expired/invalid token looks the same as any other failure here —
      // bounce back to the password screen rather than showing a list that
      // can't actually be used.
      if (err instanceof ApiError && err.status === 401) {
        onExpired();
        return;
      }
      setLoadError(err instanceof Error ? err.message : "Could not load businesses");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fires an async fetch; any setState happens after it resolves, not synchronously during this effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filtered = (businesses ?? []).filter((b) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q);
  });

  return (
    <main className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Card>
          <CardContent className="flex flex-wrap items-start justify-between gap-2 py-4">
            <div>
              <h1 className="flex items-center gap-2 text-xl font-extrabold text-primary-text">
                <Shield className="size-5" />
                Support Console
              </h1>
              <p className="text-sm text-muted-foreground">
                {businesses ? `${businesses.length} business${businesses.length === 1 ? "" : "es"} registered.` : "Loading..."}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={onExit}>
              <LogOut className="size-4" />
              Exit Support Mode
            </Button>
          </CardContent>
        </Card>

        {loadError && <p role="alert" className="text-sm font-medium text-destructive">{loadError}</p>}

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search businesses"
            placeholder="Search by business name or code..."
            className="h-11 pr-9 pl-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {!businesses && <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>}
        {businesses && filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No businesses match your search.</p>
        )}

        <div className="flex flex-col gap-3">
          {filtered.map((business) => (
            <BusinessRow key={business.id} business={business} token={token} onChanged={load} />
          ))}
        </div>
      </div>
    </main>
  );
}

function BusinessRow({ business, token, onChanged }: { business: Business; token: string; onChanged: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-bold">{business.name}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="font-mono text-xs">
                Code: {business.code}
              </Badge>
              {business.frozen && (
                <Badge className="bg-primary text-primary-foreground text-xs">
                  <Snowflake className="size-3" />
                  FROZEN
                </Badge>
              )}
              <Badge
                variant="outline"
                className={badgeClass(business.maxOperators != null && business.operatorCount >= business.maxOperators)}
              >
                {business.operatorCount}
                {business.maxOperators != null ? `/${business.maxOperators}` : ""} operators
              </Badge>
              <Badge variant="outline" className="text-xs">
                {business.customerCount} customers
              </Badge>
              <Badge variant="outline" className="text-xs">
                {business.excavatorCount} machines
              </Badge>
              {business.maxBillsPerDay != null && (
                <Badge variant="outline" className={badgeClass(business.billsToday >= business.maxBillsPerDay)}>
                  Bills today: {business.billsToday}/{business.maxBillsPerDay}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ManageLimitsDialog business={business} token={token} onChanged={onChanged} />
          <FreezeDialog business={business} token={token} onChanged={onChanged} />
          <AccessAdminDialog business={business} token={token} disabled={business.userCount === 0} />
          <ClearDataDialog business={business} token={token} onChanged={onChanged} />
        </div>
      </CardContent>
    </Card>
  );
}

function badgeClass(overLimit: boolean) {
  return `text-xs ${overLimit ? "border-destructive/40 bg-destructive/10 text-destructive" : ""}`;
}

function AccessAdminDialog({ business, token, disabled }: { business: Business; token: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleAccess() {
    setPending(true);
    setError("");
    try {
      await apiFetch("/api/support/impersonate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ businessCode: business.code, reason: reason.trim() }),
      });
      // A full navigation, not router.push() — impersonation just swapped
      // the session cookie to a different business entirely, and this page
      // (and anything cached in SWR/React state from browsing the support
      // console itself) must not carry over into that business's session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not access this business");
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" disabled={disabled} />}>
        <User className="size-4" />
        Access Admin
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Access {business.name}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This logs this browser into <strong>{business.name}</strong> (code {business.code}) as their admin. The
          action is recorded in the audit log.
        </p>
        <ReasonField id="access-reason" value={reason} onChange={setReason} disabled={pending} />
        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleAccess} disabled={pending || !reasonOk(reason)}>
            {pending ? "Accessing..." : "Access Admin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FreezeDialog({ business, token, onChanged }: { business: Business; token: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    setPending(true);
    setError("");
    try {
      await apiFetch("/api/support/freeze", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ businessCode: business.code, frozen: !business.frozen, reason: reason.trim() }),
      });
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update freeze status");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button size="sm" variant={business.frozen ? "default" : "outline"} className={business.frozen ? "" : "border-primary/40 text-primary-text"} />}
      >
        <Snowflake className="size-4" />
        {business.frozen ? "Unfreeze" : "Freeze"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {business.frozen ? "Unfreeze" : "Freeze"} {business.name}?
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {business.frozen
            ? `This immediately restores access for the owner and every operator of ${business.name} (code ${business.code}).`
            : `This immediately locks out the owner and every operator of ${business.name} (code ${business.code}) — they'll see a full-screen notice to contact support.`}
        </p>
        <ReasonField id="freeze-reason" value={reason} onChange={setReason} disabled={pending} />
        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant={business.frozen ? "default" : "destructive"} onClick={handleConfirm} disabled={pending || !reasonOk(reason)}>
            {pending ? "Please wait..." : business.frozen ? "Unfreeze" : "Freeze Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageLimitsDialog({ business, token, onChanged }: { business: Business; token: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [maxOperators, setMaxOperators] = useState(business.maxOperators != null ? String(business.maxOperators) : "");
  const [maxBillsPerDay, setMaxBillsPerDay] = useState(business.maxBillsPerDay != null ? String(business.maxBillsPerDay) : "");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      await apiFetch("/api/support/limits", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          businessCode: business.code,
          maxOperators: maxOperators.trim() || null,
          maxBillsPerDay: maxBillsPerDay.trim() || null,
          reason: reason.trim(),
        }),
      });
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save limits");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" />}>
        <AlertCircle className="size-4" />
        Manage Limits
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Limits — {business.name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Leave a field blank for unlimited. Applies immediately — a business already over a new limit isn&rsquo;t
          disrupted, but can&rsquo;t add more until back under it.
        </p>
        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="max-operators" className="text-sm">
              Max Operators
            </Label>
            <Input
              id="max-operators"
              type="number"
              min="1"
              value={maxOperators}
              onChange={(e) => setMaxOperators(e.target.value)}
              placeholder="Unlimited"
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">Currently {business.operatorCount} operator(s)</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="max-bills" className="text-sm">
              Max Bills Generated Per Day
            </Label>
            <Input
              id="max-bills"
              type="number"
              min="1"
              value={maxBillsPerDay}
              onChange={(e) => setMaxBillsPerDay(e.target.value)}
              placeholder="Unlimited"
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">{business.billsToday} bill(s) generated today</p>
          </div>
          <ReasonField id="limits-reason" value={reason} onChange={setReason} disabled={pending} />
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !reasonOk(reason)}>
              {pending ? "Saving..." : "Save Limits"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ClearDataCounts = {
  bills: number;
  workSessions: number;
  serviceRecords: number;
  expenses: number;
  workRequests: number;
  assignments: number;
  excavators: number;
  customers: number;
  sites: number;
  bankAccounts: number;
  sequences: number;
};

/** Wipes a business's bills/customers/machines/work history — everything
 * that feeds revenue and stats — for cleaning up mistaken or test data.
 * Keeps the business itself, its owner login(s), its operators (drivers),
 * AND every operator salary/money transaction (advances, deductions,
 * bonuses, payments already recorded) untouched. No undo, so the confirm
 * button stays disabled until the exact business code is typed in. */
function ClearDataDialog({ business, token, onChanged }: { business: Business; token: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirmCode, setConfirmCode] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ClearDataCounts | null>(null);

  function reset() {
    setConfirmCode("");
    setReason("");
    setError("");
    setResult(null);
  }

  async function handleClear() {
    setPending(true);
    setError("");
    try {
      const { counts } = await apiFetch<{ counts: ClearDataCounts }>("/api/support/clear-data", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ businessCode: business.code, confirmCode, reason: reason.trim() }),
      });
      setResult(counts);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear this business's data");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="destructive" />}>
        <Trash2 className="size-4" />
        Clear Data
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clear {business.name}&rsquo;s Data?</DialogTitle>
        </DialogHeader>
        {result ? (
          <>
            <p className="text-sm text-muted-foreground">Cleared for {business.name} (code {business.code}):</p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <li>{result.bills} bills</li>
              <li>{result.workSessions} work sessions</li>
              <li>{result.customers} customers</li>
              <li>{result.excavators} machines</li>
              <li>{result.sites} sites</li>
              <li>{result.serviceRecords} service records</li>
              <li>{result.expenses} expenses</li>
              <li>{result.bankAccounts} bank accounts</li>
              <li>{result.workRequests + result.assignments} operator-machine links</li>
            </ul>
            <p className="text-sm font-medium text-working">
              Operators (drivers), the owner login, and every operator salary/money transaction were kept untouched.
            </p>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              This permanently deletes every bill, payment, work session, service record, expense, customer,
              machine, and site for <strong>{business.name}</strong> (code {business.code}) — there&rsquo;s no undo.
              Its operators (drivers), owner login, and every operator salary/money transaction (advances,
              deductions, bonuses, payments already recorded) are kept untouched.
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-code" className="text-sm">
                Type the business code (<span className="font-mono">{business.code}</span>) to confirm
              </Label>
              <Input
                id="confirm-code"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                className="h-11 font-mono uppercase"
                autoFocus
                disabled={pending}
              />
            </div>
            <ReasonField id="clear-reason" value={reason} onChange={setReason} disabled={pending} />
            {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleClear}
                disabled={pending || !reasonOk(reason) || confirmCode.trim().toUpperCase() !== business.code.toUpperCase()}
              >
                {pending ? "Clearing..." : "Clear Data"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
