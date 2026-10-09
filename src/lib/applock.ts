import { Capacitor } from "@capacitor/core";

const FLAG_KEY = "budgetapp-applock";

/** Whether the user enabled biometric app lock (native only). */
export function isAppLockEnabled(): boolean {
  try {
    return (
      Capacitor.isNativePlatform() && localStorage.getItem(FLAG_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function setAppLockEnabled(on: boolean): void {
  try {
    localStorage.setItem(FLAG_KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
}

export type LockCheck =
  | { state: "unneeded" }
  | { state: "locked" }
  | { state: "unavailable" };

/**
 * Decide whether to show the lock gate. Fail-open: if biometrics are
 * missing, unenrolled, or erroring, the app stays usable.
 */
export async function shouldLock(): Promise<LockCheck> {
  if (!isAppLockEnabled()) return { state: "unneeded" };
  try {
    const mod = (await import("capacitor-native-biometric")) as unknown as Record<
      string,
      unknown
    >;
    const Bio = (mod.NativeBiometric ?? mod.default ?? mod) as {
      isAvailable?: () => Promise<unknown>;
    };
    if (!Bio || typeof Bio.isAvailable !== "function") return { state: "unavailable" };
    await Bio.isAvailable();
    return { state: "locked" };
  } catch {
    return { state: "unavailable" };
  }
}

/** Prompt the biometric gate. Returns true on success. Never throws. */
export async function unlockApp(): Promise<boolean> {
  try {
    const mod = (await import("capacitor-native-biometric")) as unknown as Record<
      string,
      unknown
    >;
    const Bio = (mod.NativeBiometric ?? mod.default ?? mod) as {
      verifyIdentity?: (opts: Record<string, string>) => Promise<unknown>;
    };
    if (!Bio || typeof Bio.verifyIdentity !== "function") return false;
    await Bio.verifyIdentity({
      reason: "Unlock BudgetApp",
      title: "Budget App",
      subtitle: "Confirm it's you to open your budgets",
    });
    return true;
  } catch {
    return false;
  }
}
