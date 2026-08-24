import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloudflare quick tunnels get a fresh random *.trycloudflare.com subdomain
  // every restart — wildcarding it here means the dev server never needs to
  // be reconfigured when the tunnel URL changes, only restarted.
  allowedDevOrigins: ["*.trycloudflare.com"],
  // Hides the on-screen Next.js dev-mode route indicator — operators/owners
  // using the tunnel link shouldn't see framework chrome.
  devIndicators: false,
};

export default nextConfig;
