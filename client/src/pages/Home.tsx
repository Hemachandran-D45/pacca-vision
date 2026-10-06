import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  AccessDenied,
  demoAllowedPaths,
  getAvailablePerspectives,
  LoginScreen,
  SkeletonPage,
  toAppUser,
} from "@/components/Auth";
import type { AppUser, SessionUser } from "@/components/Auth";
import { fetchMe, signOut, UNAUTHORIZED_EVENT } from "@/senderra/api";
import { AppLayout } from "@/components/layout/AppLayout";
import { AppRoutes } from "@/routes/AppRoutes";
import { pageMeta } from "@/routes/pageMeta";

/** Which role a Platform Admin or Developer is previewing as. UX only: the
 * server always authorizes against the signed-in role. */
const PERSPECTIVE_KEY = "pacca_perspective";

export default function Home() {
  const [path, navigate] = useLocation();
  // Identity comes from the server (GET /me reads the httpOnly session cookie);
  // nothing about who you are is trusted from localStorage any more. The only
  // thing kept locally is which lower role an admin is previewing as.
  const [authenticatedUser, setAuthenticatedUser] = useState<AppUser | null>(null);
  const [activeUser, setActiveUser] = useState<AppUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loading, setLoading] = useState(false);

  function startSession(session: SessionUser) {
    const user = toAppUser(session);
    let perspective = user.role;
    try {
      const saved = localStorage.getItem(PERSPECTIVE_KEY) as AppUser["role"] | null;
      if (saved && getAvailablePerspectives(user.role).includes(saved)) perspective = saved;
    } catch {}
    setAuthenticatedUser(user);
    setActiveUser({ ...user, role: perspective });
  }

  function endSession() {
    setAuthenticatedUser(null);
    setActiveUser(null);
    try {
      localStorage.removeItem(PERSPECTIVE_KEY);
    } catch {}
  }

  useEffect(() => {
    try {
      // Left over from the mock login, which trusted these blindly.
      localStorage.removeItem("pacca_auth_user");
      localStorage.removeItem("pacca_active_user");
    } catch {}
    void fetchMe().then((session) => {
      if (session) startSession(session);
      setCheckingSession(false);
    });
    const onUnauthorized = () => endSession();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const user = activeUser;
  const allowedPaths = user ? demoAllowedPaths(user.role) : [];
  const availablePerspectives = authenticatedUser ? getAvailablePerspectives(authenticatedUser.role) : [];

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const timer = window.setTimeout(() => setLoading(false), 650);
    return () => window.clearTimeout(timer);
  }, [path, user]);

  // Set when the reviewer jumps from a document straight into HIL, so the
  // workbench opens on that document instead of the top of the queue.
  const [hilFocus, setHilFocus] = useState<string | null>(null);

  if (checkingSession) return <SkeletonPage />;

  if (!user) {
    return (
      <LoginScreen
        onLogin={(session) => {
          startSession(session);
          navigate("/documents");
        }}
      />
    );
  }

  if (path === "/central-admin") {
    navigate("/");
    return null;
  }


  const detailMatch = path.match(/^\/documents\/(.+)$/);
  const basePath = detailMatch ? "/documents" : path;
  const meta = pageMeta[basePath] ?? pageMeta["/"];
  const go = (next: string) => navigate(next);
  const hasAccess = allowedPaths.includes(basePath);

  function switchRole(role: AppUser["role"]) {
    if (!availablePerspectives.includes(role)) {
      toast.error(`Your authenticated persona does not have permission to switch to ${role}`);
      return;
    }
    const next: AppUser = {
      ...authenticatedUser!,
      role,
      tenant: "Client",
      tenantCode: "CLIENT",
      experience: "client",
    };
    setActiveUser(next);
    try {
      localStorage.setItem(PERSPECTIVE_KEY, role);
    } catch {}
    const nextAllowed = demoAllowedPaths(role);
    if (!nextAllowed.includes(basePath) || basePath === "/central-admin") {
      if (role === "PACCA Solution Developer") {
        go("/solutions-v2");
      } else if (role === "Client Staff") {
        go("/documents");
      } else {
        go("/");
      }
    }
    toast.success(`Switched perspective to ${role} (${authenticatedUser?.initials})`);
  }

  const openDocument = (documentId: string) => go(`/documents/${encodeURIComponent(documentId)}`);
  const openHil = (documentId: string) => {
    setHilFocus(documentId);
    go("/hil-review");
  };

  return (
    <AppLayout
      path={basePath}
      title={meta.title}
      subtitle={meta.subtitle}
      user={user}
      allowedPaths={allowedPaths}
      authenticatedRole={authenticatedUser?.role}
      availablePerspectives={availablePerspectives}
      onNavigate={go}
      onLogout={() => {
        void signOut().finally(endSession);
      }}
      onRoleSwitch={switchRole}
    >
      {loading ? (
        <SkeletonPage />
      ) : hasAccess ? (
        <AppRoutes
          path={path}
          user={user}
          hilFocus={hilFocus}
          onNavigate={go}
          onOpenDocument={openDocument}
          onOpenHil={openHil}
        />
      ) : (
        <AccessDenied role={user.role} onNavigate={go} />
      )}
    </AppLayout>
  );
}
