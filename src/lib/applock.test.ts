import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
}));

// Minimal localStorage for non-jsdom environments.
if (typeof localStorage === "undefined") {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}

import {
  setLockMode,
  setPin,
  verifyPin,
  getLockoutRemainingMs,
  clearFailedAttempts,
} from "./applock";

beforeEach(() => {
  localStorage.clear();
  setLockMode("pin4");
});

describe("PIN storage", () => {
  it("round-trips a correct PIN and rejects wrong ones", async () => {
    expect(await setPin("1234")).toBe(true);
    expect(await verifyPin("1234")).toBe(true);
    expect(await verifyPin("0000")).toBe(false);
  });

  it("stores PBKDF2 parameters, not a bare hash", async () => {
    await setPin("1234");
    const raw = localStorage.getItem("budgetapp-applock-pin") ?? "";
    const rec = JSON.parse(raw) as Record<string, unknown>;
    expect(rec.iters).toBeGreaterThan(0);
    expect(rec.salt).toBeTruthy();
    expect(String(rec.hash)).not.toContain("1234");
  });

  it("migrates legacy SHA-256 records transparently", async () => {
    // legacy format: plain salted SHA-256, no iteration count
    const salt = "abcdef0123456789abcdef0123456789";
    const msg = `${salt}:5678`;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(msg));
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("budgetapp-applock-pin", JSON.stringify({ salt, hash, len: 4 }));
    expect(await verifyPin("5678")).toBe(true);
    const upgraded = JSON.parse(localStorage.getItem("budgetapp-applock-pin") ?? "{}") as Record<string, unknown>;
    expect(upgraded.iters).toBeGreaterThan(0);
  });
});

describe("brute-force lockout", () => {
  it("locks out after repeated failures and clears", async () => {
    await setPin("1234");
    for (let i = 0; i < 5; i++) expect(await verifyPin("0000")).toBe(false);
    expect(getLockoutRemainingMs()).toBeGreaterThan(0);
    // locked: even the right PIN is refused while locked
    expect(await verifyPin("1234")).toBe(false);
    clearFailedAttempts();
    expect(getLockoutRemainingMs()).toBe(0);
    expect(await verifyPin("1234")).toBe(true);
  });
});
