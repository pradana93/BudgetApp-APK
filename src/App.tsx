import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { SessionProvider } from "@/hooks/useSession";
import { ToastProvider } from "@/components/ui/toast";
import type { ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { Layout } from "@/components/Layout";
import { MaterialShell } from "@/components/native/MaterialShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { NativeEffects } from "@/components/NativeEffects";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Budgets from "@/pages/Budgets";
import NewBudget from "@/pages/NewBudget";
import BudgetDetail from "@/pages/BudgetDetail";
import Requests from "@/pages/Requests";
import NewRequest from "@/pages/NewRequest";
import RequestDetail from "@/pages/RequestDetail";
import Settings from "@/pages/Settings";
import Admin from "@/pages/Admin";
import Notifications from "@/pages/Notifications";
import Rewards from "@/pages/Rewards";
import Calendar from "@/pages/Calendar";
import Space from "@/pages/Space";
import Changelogs from "@/pages/Changelogs";
import Triage from "@/pages/Triage";

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** APK renders the Material shell; web keeps the desktop Layout. Pages are shared untouched. */
function Shell({ children }: { children: ReactNode }) {
  return isNativeApp() ? <MaterialShell>{children}</MaterialShell> : <Layout>{children}</Layout>;
}

export default function App(){
  return <QueryClientProvider client={qc}>
    <LanguageProvider>
    <SessionProvider>
      <ToastProvider>
        <NativeEffects />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/" element={<ProtectedRoute><Shell><Dashboard /></Shell></ProtectedRoute>} />
            <Route path="/budgets" element={<ProtectedRoute><Shell><Budgets /></Shell></ProtectedRoute>} />
            <Route path="/budgets/new" element={<ProtectedRoute ownerOnly><Shell><NewBudget /></Shell></ProtectedRoute>} />
            <Route path="/budgets/:id" element={<ProtectedRoute><Shell><BudgetDetail /></Shell></ProtectedRoute>} />
            <Route path="/requests" element={<ProtectedRoute><Shell><Requests /></Shell></ProtectedRoute>} />
            <Route path="/requests/new" element={<ProtectedRoute><Shell><NewRequest /></Shell></ProtectedRoute>} />
            <Route path="/requests/:id" element={<ProtectedRoute><Shell><RequestDetail /></Shell></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Shell><Settings /></Shell></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute ownerOnly><Shell><Admin /></Shell></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><Shell><Notifications /></Shell></ProtectedRoute>} />
            <Route path="/rewards" element={<ProtectedRoute><Shell><Rewards /></Shell></ProtectedRoute>} />
            <Route path="/calendar" element={<ProtectedRoute><Shell><Calendar /></Shell></ProtectedRoute>} />
            <Route path="/space" element={<ProtectedRoute><Shell><Space /></Shell></ProtectedRoute>} />
            <Route path="/triage" element={<ProtectedRoute ownerOnly><Shell><Triage /></Shell></ProtectedRoute>} />
            <Route path="/changelogs" element={<ProtectedRoute><Shell><Changelogs /></Shell></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </SessionProvider>
    </LanguageProvider>
  </QueryClientProvider>;
}
