import { describe, expect, it } from "vitest";
import { isTrustedReleaseAssetUrl } from "@/lib/validation/app-version";

const REPO = "mystio1/excavator-manager";

describe("isTrustedReleaseAssetUrl (the only outbound fetch driven by remote data)", () => {
  it("accepts a github.com release download of this repository", () => {
    expect(isTrustedReleaseAssetUrl(`https://github.com/${REPO}/releases/download/v12/version.json`, REPO)).toBe(true);
  });

  it("is case-insensitive about the repository path", () => {
    expect(isTrustedReleaseAssetUrl("https://github.com/MyStio1/Excavator-Manager/releases/download/v1/version.json", REPO)).toBe(true);
  });

  it.each([
    ["plain http", `http://github.com/${REPO}/releases/download/v1/version.json`],
    ["another host", `https://evil.example/${REPO}/releases/download/v1/version.json`],
    ["look-alike host", `https://github.com.evil.example/${REPO}/releases/download/v1/version.json`],
    ["userinfo trick", `https://github.com@evil.example/${REPO}/releases/download/v1/version.json`],
    ["internal address", "http://169.254.169.254/latest/meta-data/"],
    ["another repository", "https://github.com/someone/else/releases/download/v1/version.json"],
    ["not a release download", `https://github.com/${REPO}/raw/main/version.json`],
    ["explicit port", `https://github.com:8443/${REPO}/releases/download/v1/version.json`],
    ["not a URL", "not a url"],
    ["empty", ""],
  ])("rejects %s", (_name, url) => {
    expect(isTrustedReleaseAssetUrl(url, REPO)).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isTrustedReleaseAssetUrl(undefined, REPO)).toBe(false);
    expect(isTrustedReleaseAssetUrl({ href: "https://github.com" }, REPO)).toBe(false);
  });
});
