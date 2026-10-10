import * as React from "react";
import { createPortal } from "react-dom";
import { isNative } from "@/lib/native";

export const OVERLAY_ROOT_ID = "native-overlay-root";

/**
 * Renders fixed overlays into a clean container at the end of the native
 * shell. Page subtrees can carry stacking contexts (animations, filters,
 * overflow) that trap z-index and break fixed positioning — portaling
 * sidesteps the entire bug class. Falls back to inline rendering on web
 * or when the container is absent.
 */
export function NativePortal({ children }: { children: React.ReactNode }) {
  if (!isNative() || typeof document === "undefined") return <>{children}</>;
  const el = document.getElementById(OVERLAY_ROOT_ID);
  if (!el) return <>{children}</>;
  return createPortal(children, el);
}
