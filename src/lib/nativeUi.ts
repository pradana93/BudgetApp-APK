/**
 * Native-shell UI coordination. Lets the hardware back button close the
 * navigation drawer before falling back to history navigation.
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
