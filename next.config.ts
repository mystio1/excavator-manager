import type { NextConfig } from "next";

// Two build targets share this one config: the web deployment (Render, live
// server) and the Android bundle (static export baked into the APK — see
// scripts/build-android.mjs, which also strips src/app/api before running
// this build since Route Handlers that read the request can't be statically
// exported). BUILD_TARGET is only ever set by that script, never in normal
// dev/deploy.
const isAndroidBuild = process.env.BUILD_TARGET === "android";

const nextConfig: NextConfig = {
  ...(isAndroidBuild ? { output: "export" } : {}),
  // Cloudflare quick tunnels get a fresh random *.trycloudflare.com subdomain
  // every restart — wildcarding it here means the dev server never needs to
  // be reconfigured when the tunnel URL changes, only restarted.
  allowedDevOrigins: ["*.trycloudflare.com"],
  // Hides the on-screen Next.js dev-mode route indicator — operators/owners
  // using the tunnel link shouldn't see framework chrome.
  devIndicators: false,
};

export default nextConfig;
