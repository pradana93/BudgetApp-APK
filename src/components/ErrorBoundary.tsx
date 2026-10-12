import { Component, type ErrorInfo, type ReactNode } from "react";
import { STRINGS, type Lang } from "@/i18n/translations";

type Props = { children: ReactNode };
type State = { error: Error | null; stack: string | null; copied: boolean };

const CRASH_KEY = "budgetapp-last-crash";

/** Class component can't use the lang hook; read the saved locale directly. */
function crashLang(): Lang {
  try {
    return window.localStorage.getItem("budgetapp-lang") === "id" ? "id" : "en";
  } catch {
    return "en";
  }
}

/** Catches render-time crashes so users see a message instead of a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const stack = info.componentStack ?? null;
    console.error("App crashed:", error, stack);
    try {
      window.localStorage.setItem(
        CRASH_KEY,
        JSON.stringify({ message: error.message, stack, url: window.location.href, time: new Date().toISOString() })
      );
    } catch {
      /* storage unavailable */
    }
    this.setState({ stack });
  }

  copy = async () => {
    const { error, stack } = this.state;
    const text = `${error?.name ?? "Error"}: ${error?.message ?? "unknown"}\nURL: ${window.location.href}\n${stack ?? ""}`;
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
    } catch {
      /* clipboard unavailable */
    }
  };

  render(): ReactNode {
    const { error, stack, copied } = this.state;
    const s = STRINGS[crashLang()];
    if (error) {
      return (
        <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <div style={{ maxWidth: 640, width: "100%" }}>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>{s["eb.title"]}</h1>
            <p style={{ marginTop: 8, fontSize: 14, opacity: 0.8 }}>{error.message}</p>
            {stack && (
              <details style={{ marginTop: 12, fontSize: 12 }}>
                <summary style={{ cursor: "pointer", opacity: 0.8 }}>{s["eb.details"]}</summary>
                <pre style={{ marginTop: 8, padding: 12, borderRadius: 8, background: "rgba(127,127,127,0.12)", overflow: "auto", maxHeight: 220 }}>{stack}</pre>
              </details>
            )}
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button style={{ padding: "8px 16px", cursor: "pointer" }} onClick={() => window.location.reload()}>
                {s["eb.reload"]}
              </button>
              <button style={{ padding: "8px 16px", cursor: "pointer" }} onClick={this.copy}>
                {copied ? s["eb.copied"] : s["eb.copyDetails"]}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
