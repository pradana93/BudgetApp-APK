import { Capacitor } from "@capacitor/core";

const FLAG_KEY = "budgetapp-applock";
const MODE_KEY = "budgetapp-applock-mode";
const PIN_KEY = "budgetapp-applock-pin";
const UNLOCKED_AT_KEY = "budgetapp-unlocked-at";
const INACTIVE_AT_KEY = "budgetapp-inactive-at";

export type LockMode = "off" | "biometric" | "pin4" | "pin6";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

/** Current lock mode (native only; web is always off). */
export function getLockMode(): LockMode {
  try {
    if (!Capacitor.isNativePlatform()) return "off";
    const m = read(MODE_KEY);
    if (m === "biometric" || m === "pin4" || m === "pin6") return m;
    // legacy single-flag migration
    if (read(FLAG_KEY) === "1") return "biometric";
    return "off";
  } catch {
    return "off";
  }
}

/** Legacy helper — kept for callers. True unless mode is off. */
export function isAppLockEnabled(): boolean {
  return getLockMode() !== "off";
}

export function setAppLockEnabled(on: boolean): void {
  setLockMode(on ? "biometric" : "off");
}

export function setLockMode(mode: LockMode): void {
  write(MODE_KEY, mode);
  write(FLAG_KEY, mode === "off" ? "0" : "1");
}

/** Stamp backgrounding so resumes can tell blips from real away time. */
export function noteInactive(): void {
  write(INACTIVE_AT_KEY, String(Date.now()));
}

/** True when the app was backgrounded only briefly (share sheet, dialogs). */
export function brieflyAway(thresholdMs = 2500): boolean {
  try {
    const ts = Number(read(INACTIVE_AT_KEY) ?? 0);
    return ts > 0 && Date.now() - ts < thresholdMs;
  } catch {
    return false;
  }
}

/** Stamp a successful unlock (loop guard, persisted across reloads). */
export function recordUnlock(): void {
  write(UNLOCKED_AT_KEY, String(Date.now()));
}

export function unlockTimestamp(): number {
  try {
    return Number(read(UNLOCKED_AT_KEY) ?? 0);
  } catch {
    return 0;
  }
}

/** True when an unlock completed after the last backgrounding. */
export function unlockedSinceBackground(): boolean {
  try {
    const u = Number(read(UNLOCKED_AT_KEY) ?? 0);
    const i = Number(read(INACTIVE_AT_KEY) ?? 0);
    return u > 0 && u >= i;
  } catch {
    return false;
  }
}

export type LockCheck =
  | { state: "unneeded" }
  | { state: "locked"; mode: Exclude<LockMode, "off"> }
  | { state: "unavailable" };

/**
 * Decide whether to show the lock gate. Fail-open: if biometrics are
 * missing, unenrolled, or erroring, the app stays usable. PIN mode
 * needs no hardware — a set PIN always locks.
 */
export async function shouldLock(): Promise<LockCheck> {
  const mode = getLockMode();
  if (mode === "off") return { state: "unneeded" };
  if (mode === "pin4" || mode === "pin6") {
    return (await hasPin(mode)) ? { state: "locked", mode } : { state: "unneeded" };
  }
  try {
    const Bio = await loadBio();
    if (!Bio || typeof Bio.isAvailable !== "function") return { state: "unavailable" };
    await Bio.isAvailable();
    return { state: "locked", mode: "biometric" };
  } catch {
    return { state: "unavailable" };
  }
}

async function loadBio(): Promise<{
  isAvailable?: () => Promise<unknown>;
  verifyIdentity?: (opts: Record<string, string>) => Promise<unknown>;
} | null> {
  try {
    const mod = (await import("capacitor-native-biometric")) as unknown as Record<string, unknown>;
    const Bio = (mod.NativeBiometric ?? mod.default ?? mod) as {
      isAvailable?: () => Promise<unknown>;
      verifyIdentity?: (opts: Record<string, string>) => Promise<unknown>;
    };
    return Bio ?? null;
  } catch {
    return null;
  }
}

/** Prompt the biometric gate. Returns true on success. Never throws. */
export async function unlockApp(): Promise<boolean> {
  try {
    const Bio = await loadBio();
    if (!Bio || typeof Bio.verifyIdentity !== "function") return false;
    await Bio.verifyIdentity({
      reason: "Unlock BudgetApp",
      title: "Budget App",
      subtitle: "Confirm it's you to open your budgets",
    });
    recordUnlock();
    return true;
  } catch {
    return false;
  }
}

// ---------- PIN ----------

type PinRecord = { salt: string; hash: string; len: 4 | 6 };

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function readPin(): (PinRecord & { mode: LockMode }) | null {
  try {
    const mode = getLockMode();
    if (mode !== "pin4" && mode !== "pin6") return null;
    const raw = read(PIN_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as PinRecord;
    if (!rec.salt || !rec.hash) return null;
    return { ...rec, len: mode === "pin6" ? 6 : 4, mode };
  } catch {
    return null;
  }
}

async function hasPin(mode: LockMode): Promise<boolean> {
  try {
    if (mode !== "pin4" && mode !== "pin6") return false;
    return readPin() !== null;
  } catch {
    return false;
  }
}

/** Store a new PIN (length must match the active pin mode). */
export async function setPin(pin: string): Promise<boolean> {
  try {
    const mode = getLockMode();
    const len = mode === "pin6" ? 6 : 4;
    if (!new RegExp(`^\\d{${len}}$`).test(pin)) return false;
    const salt = randomSalt();
    const hash = await sha256Hex(`${salt}:${pin}`);
    write(PIN_KEY, JSON.stringify({ salt, hash, len }));
    return true;
  } catch {
    return false;
  }
}

/** Verify a PIN entry. Never throws. */
export async function verifyPin(pin: string): Promise<boolean> {
  try {
    const rec = readPin();
    if (!rec || pin.length !== rec.len) return false;
    const hash = await sha256Hex(`${rec.salt}:${pin}`);
    return hash === rec.hash;
  } catch {
    return false;
  }
}

/** Expected PIN length for the active mode (0 when not PIN mode). */
export function pinLength(): number {
  const mode = getLockMode();
  return mode === "pin6" ? 6 : mode === "pin4" ? 4 : 0;
}
