"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

/** Shows the installed APK version at the bottom of Settings — Android only
 * (there's no meaningful "app version" for the web build). Mainly so a
 * mismatch between what's installed and what UpdateDialog is comparing
 * against is easy to spot at a glance, without digging into Android's own
 * app-info screen. */
export function AppVersionFooter() {
  const [versionName, setVersionName] = useState<string | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    App.getInfo().then((info) => setVersionName(info.version));
  }, []);

  if (!versionName) return null;

  return <p className="pb-2 text-center text-xs text-muted-foreground">Version {versionName}</p>;
}
