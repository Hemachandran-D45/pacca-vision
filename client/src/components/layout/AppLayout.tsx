import { useState } from "react";
import { cn } from "@/lib/utils";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { AppUser } from "@/components/Auth";

export function AppLayout({
  path,
  title,
  subtitle,
  user,
  allowedPaths,
  authenticatedRole,
  availablePerspectives,
  onNavigate,
  onLogout,
  onRoleSwitch,
  children,
}: {
  path: string;
  title: string;
  subtitle: string;
  user: AppUser;
  allowedPaths: string[];
  authenticatedRole?: AppUser["role"];
  availablePerspectives?: AppUser["role"][];
  onNavigate: (path: string) => void;
  onLogout: () => void;
  onRoleSwitch: (role: AppUser["role"]) => void;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f2f2f0] text-[#0e0e0e]">
      <Sidebar
        path={path}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onNavigate={onNavigate}
        onCloseMobile={() => setMobileOpen(false)}
        onLogout={onLogout}
        user={user}
        allowedPaths={allowedPaths}
      />
      <div
        className={cn(
          "min-h-screen transition-[padding] duration-200 lg:pl-[260px]",
          collapsed && "lg:pl-[78px]"
        )}
      >
        <Topbar
          title={title}
          subtitle={subtitle}
          onMenu={() => setMobileOpen(true)}
          collapsed={collapsed}
          onCollapse={() => setCollapsed(!collapsed)}
          user={user}
          authenticatedRole={authenticatedRole}
          availablePerspectives={availablePerspectives}
          onRoleSwitch={onRoleSwitch}
        />
        <main className="min-h-[calc(100vh-76px)]">{children}</main>
      </div>
      {mobileOpen && (
        <button
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-[#0e0e0e]/60 backdrop-blur-sm lg:hidden"
        />
      )}
    </div>
  );
}
