/**
 * Native-shell UI coordination. Lets the hardware back button close the
 * topmost sheet/dialog first, then the navigation drawer, then history.
 */
let drawerCloser: (() => boolean) | null = null;

export function registerDrawerCloser(fn: () => boolean): () => void {
  drawerCloser = fn;
  return () => {
    if (drawerCloser === fn) drawerCloser = null;
  };
}

export function tryCloseDrawer(): boolean {
  try {
    return drawerCloser?.() ?? false;
  } catch {
    return false;
  }
}

const sheetClosers: Array<() => boolean> = [];

/** Sheets/dialogs register here; last opened wins. */
export function registerSheetCloser(fn: () => boolean): () => void {
  sheetClosers.push(fn);
  return () => {
    const i = sheetClosers.indexOf(fn);
    if (i >= 0) sheetClosers.splice(i, 1);
  };
}

export function tryCloseSheet(): boolean {
  try {
    for (let i = sheetClosers.length - 1; i >= 0; i--) {
      if (sheetClosers[i]()) return true;
    }
  } catch {
    // fall through to drawer/history handling
  }
  return false;
}
