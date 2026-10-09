import { Capacitor } from "@capacitor/core";

/**
 * Native share sheet for exported files. Returns true when the system
 * sheet was shown; false on web (caller falls back to anchor download).
 */
export async function shareTextFile(filename: string, text: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    const saved = await Filesystem.writeFile({
      path: filename,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    const { Share } = await import("@capacitor/share");
    await Share.share({
      title: filename,
      text: filename,
      files: [saved.uri],
      dialogTitle: filename,
    });
    return true;
  } catch {
    return false;
  }
}
