import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { AccessDenied, demoAllowedPaths, LoginScreen, SkeletonPage } from "@/components/MockAuth";
import type { MockUser } from "@/components/MockAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { CentralAdminPortal } from "@/pages/admin/CentralAdminPortal";
import { AppRoutes } from "@/routes/AppRoutes";
import { pageMeta } from "@/routes/pageMeta";

export default function Home() {
  const [path, navigate] = useLocation();
  const [user, setUser] = useState<MockUser | null>(null);
  const [loading, setLoading] = useState(false);
  const allowedPaths = user ? demoAllowedPaths(user.role) : [];

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
          setUser(nextUser);
          navigate(nextUser.experience === "central" ? "/central-admin" : "/");
        }}
      />
    );
  }

  if (user.experience === "central") {
    return (
      <CentralAdminPortal
        user={user}
        onLogout={() => setUser(null)}
        onClientWorkspace={(client) => {
          if (client === "Client 1") {
            setUser({
              ...user,
              name: "PACCA Admin · Client 1",
              tenant: "Client 1",
              tenantCode: "CLIENT1",
              experience: "client",
            });
            navigate("/");
          } else {
            setUser(null);
            navigate("/");
          }
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
    const isClient = role === "Client Staff";
    const next = {
      ...user,
      role,
      name:
        role === "PACCA Platform Admin"
          ? "PACCA Platform Admin"
          : role === "PACCA Solution Developer"
            ? "PACCA Solution Developer"
            : "Client Staff · Client 1",
      tenant: isClient ? "Client 1" : "PACCA Platform",
      tenantCode: isClient ? "CLIENT1" : "PACCA",
      experience: isClient ? ("client" as const) : ("central" as const),
    };
    setUser(next);
    const nextAllowed = demoAllowedPaths(role);
    if (!nextAllowed.includes(basePath)) go(isClient ? "/documents" : "/solutions-v2");
    toast.success(`Role switched to ${role}`);
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
      onNavigate={go}
      onLogout={() => setUser(null)}
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
