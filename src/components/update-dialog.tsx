"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { DownloadCloud, Loader2, TriangleAlert } from "lucide-react";
import { UpdateInstaller, type DownloadProgress } from "@/lib/native/update-installer";
import { apiUrl } from "@/lib/api-client";
import { appVersionSchema, type AppVersion } from "@/lib/validation/app-version";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type State =
  | { phase: "hidden" }
  | { phase: "available"; version: AppVersion }
  | { phase: "permission-needed"; version: AppVersion }
  | { phase: "downloading"; version: AppVersion; progress: DownloadProgress | null }
  | { phase: "ready-to-install"; version: AppVersion; path: string }
  | { phase: "error"; version: AppVersion; message: string };

/**
 * Android-only in-app update flow. Renders nothing at all outside a native
 * build (Capacitor.isNativePlatform() is false in every browser, including
 * the Cloudflare-tunnel/ordinary-web usage of this same app) — a failed or
 * skipped check here must never affect normal app use.
 */
export function UpdateDialog() {
  const [state, setState] = useState<State>({ phase: "hidden" });
  // Guards against a resume-triggered re-check clobbering an in-progress
  // download/install flow the user is already in the middle of.
  const busyRef = useRef(false);

  const checkForUpdate = useCallback(async () => {
    if (busyRef.current) return;
    try {
      const res = await fetch(apiUrl("/api/app-version"), { cache: "no-store" });
      if (!res.ok) return;
      const parsed = appVersionSchema.safeParse(await res.json());
      if (!parsed.success) return;

      const info = await App.getInfo();
      const installedVersionCode = parseInt(info.build, 10);
      if (Number.isNaN(installedVersionCode) || parsed.data.versionCode <= installedVersionCode) return;

      setState({ phase: "available", version: parsed.data });
    } catch {
      // No internet / API unreachable — a non-mandatory check failing must
      // never block or interrupt normal use of the app.
    }
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- fires an async fetch; any setState happens after it resolves, not synchronously during this effect
    checkForUpdate();
    const listenerPromise = App.addListener("resume", checkForUpdate);
    return () => {
      listenerPromise.then((handle) => handle.remove());
    };
  }, [checkForUpdate]);

  useEffect(() => {
    if (state.phase !== "downloading") return;
    const listenerPromise = UpdateInstaller.addListener("downloadProgress", (progress) => {
      setState((prev) => (prev.phase === "downloading" ? { ...prev, progress } : prev));
    });
    return () => {
      listenerPromise.then((handle) => handle.remove());
    };
  }, [state.phase]);

  if (!Capacitor.isNativePlatform() || state.phase === "hidden") return null;

  const version = state.version;
  const forceUpdate = version.forceUpdate;

  async function startDownload() {
    busyRef.current = true;
    try {
      const { allowed } = await UpdateInstaller.canRequestPackageInstalls();
      if (!allowed) {
        setState({ phase: "permission-needed", version });
        return;
      }

      setState({ phase: "downloading", version, progress: null });
      const { path } = await UpdateInstaller.downloadApk({
        url: version.apkUrl,
        expectedSha256: version.apkSha256,
      });
      setState({ phase: "ready-to-install", version, path });
    } catch (err) {
      setState({
        phase: "error",
        version,
        message: err instanceof Error ? err.message : "The download failed. Check your connection and try again.",
      });
    } finally {
      busyRef.current = false;
    }
  }

  async function installNow(path: string) {
    try {
      await UpdateInstaller.installApk({ path });
      // Android now owns the flow (its own installer screen). We don't
      // reliably learn whether the user completed it — leave the dialog as
      // "ready-to-install" so they can re-tap if they backed out, and the
      // next app resume's version check will simply stop firing once the
      // update actually lands.
    } catch (err) {
      setState({
        phase: "error",
        version,
        message: err instanceof Error ? err.message : "Could not open the installer.",
      });
    }
  }

  const dismissible = !forceUpdate;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && dismissible) setState({ phase: "hidden" });
      }}
    >
      <DialogContent showCloseButton={dismissible}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DownloadCloud className="size-5 text-primary" />
            New Update Available
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">
            A new version of Excavator Manager is available.
            <br />
            Version: <span className="font-semibold text-foreground">{version.versionName}</span>
          </p>

          {version.releaseNotes.length > 0 && (
            <div>
              <p className="mb-1 font-semibold">What&rsquo;s new:</p>
              <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                {version.releaseNotes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          {state.phase === "permission-needed" && (
            <div className="flex items-start gap-2 rounded-lg border border-idle-foreground/15 bg-idle/60 p-3 text-idle-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <p>
                This app needs permission to install updates. Tap below, enable &ldquo;Allow from this
                source&rdquo;, then come back and tap Update Now again.
              </p>
            </div>
          )}

          {state.phase === "downloading" && (
            <div className="flex flex-col gap-1.5">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width:
                      state.progress && state.progress.percent >= 0 ? `${state.progress.percent}%` : "100%",
                  }}
                />
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {state.progress && state.progress.percent >= 0
                  ? `Downloading… ${Math.round(state.progress.percent)}%`
                  : "Downloading…"}
              </p>
            </div>
          )}

          {state.phase === "error" && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/8 p-3 text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <p>{state.message}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          {!dismissible ? null : state.phase === "available" || state.phase === "error" ? (
            <Button variant="secondary" onClick={() => setState({ phase: "hidden" })}>
              Later
            </Button>
          ) : null}

          {state.phase === "available" && (
            <Button onClick={startDownload}>Update Now</Button>
          )}
          {state.phase === "permission-needed" && (
            <Button
              onClick={async () => {
                await UpdateInstaller.openInstallPermissionSettings();
              }}
            >
              Open Settings
            </Button>
          )}
          {state.phase === "downloading" && (
            <Button disabled>Downloading…</Button>
          )}
          {state.phase === "ready-to-install" && (
            <Button onClick={() => installNow(state.path)}>Install Now</Button>
          )}
          {state.phase === "error" && <Button onClick={startDownload}>Retry</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
