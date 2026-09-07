import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { AccessDenied, demoAllowedPaths, demoPersonas, LoginScreen, SkeletonPage } from "@/components/MockAuth";
import type { MockUser } from "@/components/MockAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { CentralAdminPortal } from "@/pages/admin/CentralAdminPortal";
import { AppRoutes } from "@/routes/AppRoutes";
import { pageMeta } from "@/routes/pageMeta";

export default function Home() {
  const [path, navigate] = useLocation();
  const [authenticatedUser, setAuthenticatedUser] = useState<MockUser | null>(null);
  const [activeUser, setActiveUser] = useState<MockUser | null>(null);
  const [loading, setLoading] = useState(false);

  const user = activeUser;
  const allowedPaths = user ? demoAllowedPaths(user.role) : [];
  const canSwitchPerspective = authenticatedUser?.role === "PACCA Platform Admin";

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const timer = window.setTimeout(() => setLoading(false), 650);
    return () => window.clearTimeout(timer);
  }, [path, user]);

  // Set when the reviewer jumps from a document straight into HIL, so the
  // workbench opens on that document instead of the top of the queue.
  const [hilFocus, setHilFocus] = useState<string | null>(null);

  if (!user) {
    return (
      <LoginScreen
        onLogin={(nextUser) => {
          setAuthenticatedUser(nextUser);
          setActiveUser(nextUser);
          navigate(nextUser.experience === "central" ? "/central-admin" : "/");
        }}
      />
    );
  }

  if (user.experience === "central") {
    return (
      <CentralAdminPortal
        user={user}
        onLogout={() => {
          setAuthenticatedUser(null);
          setActiveUser(null);
        }}
        onClientWorkspace={(client = "Client 1") => {
          const clientAdmin: MockUser = {
            ...authenticatedUser!,
            name: "Suresh Kiran",
            role: "PACCA Platform Admin",
            initials: "SK",
            tenant: client,
            tenantCode: "CLIENT1",
            experience: "client",
          };
          setAuthenticatedUser(clientAdmin);
          setActiveUser(clientAdmin);
          navigate("/");
        }}
      />
    );
  }

  const detailMatch = path.match(/^\/documents\/(.+)$/);
  const basePath = detailMatch ? "/documents" : path;
  const meta = pageMeta[basePath] ?? pageMeta["/"];
  const go = (next: string) => navigate(next);
  const hasAccess = allowedPaths.includes(basePath);

  const switchRole = (role: MockUser["role"]) => {
    if (!canSwitchPerspective) {
      toast.error("Role switching is restricted to Platform Administrators");
      return;
    }
    const next = demoPersonas[role] || {
      ...user,
      role,
      name: role,
      initials: role === "PACCA Platform Admin" ? "SK" : role === "PACCA Solution Developer" ? "MC" : "AR",
    };
    setActiveUser(next);
    const nextAllowed = demoAllowedPaths(role);
    if (!nextAllowed.includes(basePath)) {
      go(role === "Client Staff" ? "/documents" : "/solutions-v2");
    }
    toast.success(`Switched perspective to ${next.name} (${role})`);
  };

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
      canSwitchPerspective={canSwitchPerspective}
      onNavigate={go}
      onLogout={() => {
        setAuthenticatedUser(null);
        setActiveUser(null);
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
