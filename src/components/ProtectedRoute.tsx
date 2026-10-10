import { Navigate } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { LaunchScreen } from "@/components/LaunchScreen";

export function ProtectedRoute({ children, ownerOnly }: { children: React.ReactNode; ownerOnly?: boolean }) {
  const { session, profile, loading } = useSession();
  if (loading) return <LaunchScreen />;
  if (!session) return <Navigate to="/login" replace />;
  if (ownerOnly && profile?.role !== "owner") return <Navigate to="/" replace />;
  return <>{children}</>;
}
