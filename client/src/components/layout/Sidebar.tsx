import { Bell, Layers3, LockKeyhole, LogOut, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/common/Logo";
import { navSections } from "@/data/mockData";
import type { MockUser } from "@/components/MockAuth";

export function Sidebar({
  path,
  collapsed,
  mobileOpen,
  onNavigate,
  onCloseMobile,
  onLogout,
  user,
  allowedPaths,
}: {
  path: string;
  collapsed: boolean;
  mobileOpen: boolean;
  onNavigate: (path: string) => void;
  onCloseMobile: () => void;
  onLogout: () => void;
  user: MockUser;
  allowedPaths: string[];
}) {
  const DEMO_HIDDEN_PATHS = ["/deployment", "/infrastructure"];
  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => allowedPaths.includes(item.path) && !DEMO_HIDDEN_PATHS.includes(item.path)
      ),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col bg-[#0e0e0e] text-slate-300 shadow-2xl transition-transform duration-200 lg:translate-x-0 border-r border-white/5",
        collapsed && "lg:w-[78px]",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <div className={cn("flex h-[76px] items-center border-b border-white/8 px-5", collapsed && "lg:justify-center lg:px-0")}>
        <Logo collapsed={collapsed} />
      </div>

      <div className="flex items-center justify-between px-5 py-4">
        <div className={cn("min-w-0", collapsed && "lg:hidden")}>
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">Workspace</div>
          <div className="mt-1 flex items-center gap-2 text-[12px] font-semibold text-white">
            Client Workspace <span className="rounded-md bg-[#45bd8d]/15 text-[#45bd8d] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider">Active</span>
          </div>
        </div>
        <button className="rounded-lg p-1 text-slate-400 hover:bg-white/10 lg:hidden" onClick={onCloseMobile}>
          <X size={17} />
        </button>
        <div className={cn("hidden h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-slate-300 lg:flex", !collapsed && "lg:hidden")}>
          <Layers3 size={15} />
        </div>
      </div>

      <nav className="scrollbar-none flex-1 overflow-y-auto px-3 pb-4">
        {visibleSections.map((section) => (
          <div key={section.label} className="mb-5">
            <div className={cn("mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500", collapsed && "lg:hidden")}>
              {section.label}
            </div>
            {section.items.map((item) => {
              const active = path === item.path || (item.path !== "/" && path.startsWith(item.path));
              return (
                <button
                  key={item.path}
                  onClick={() => {
                    onNavigate(item.path);
                    onCloseMobile();
                  }}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "group mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[12px] font-medium transition-all duration-150",
                    active
                      ? "bg-[#47a2b0] text-white shadow-[0_7px_16px_rgba(71,162,176,.28)] font-semibold"
                      : "text-slate-400 hover:bg-white/7 hover:text-white",
                    collapsed && "lg:justify-center lg:px-0"
                  )}
                >
                  <item.icon
                    size={17}
                    strokeWidth={active ? 2.2 : 1.8}
                    className={cn(active ? "text-white" : "text-slate-400 group-hover:text-slate-200")}
                  />
                  <span className={cn("flex-1 truncate", collapsed && "lg:hidden")}>{item.label}</span>
                  {item.badge && (
                    <span className={cn("flex h-5 min-w-5 items-center justify-center rounded-full bg-[#f2c94c] text-[#0e0e0e] px-1.5 text-[10px] font-bold", collapsed && "lg:hidden")}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={cn("border-t border-white/8 p-3", collapsed && "lg:px-2")}>
        <div className={cn("flex items-center gap-3 rounded-xl bg-white/6 p-2.5", collapsed && "lg:justify-center lg:bg-transparent")}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#47a2b0] text-xs font-bold text-white shadow-[0_3px_8px_rgba(71,162,176,.3)]">
            {user.initials}
          </div>
          <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
            <div className="truncate text-[11px] font-semibold text-white">{user.name}</div>
            <div className="mt-0.5 truncate text-[9px] text-slate-400">{user.role}</div>
          </div>
          <button onClick={onLogout} title="Sign out" className={cn("text-slate-400 hover:text-white", collapsed && "lg:hidden")}>
            <LogOut size={16} />
          </button>
        </div>

        <div className={cn("mt-3 flex items-center justify-between px-2 text-slate-400", collapsed && "lg:hidden")}>
          <button onClick={() => toast("No new notifications")} className="hover:text-white"><Bell size={15} /></button>
          <button onClick={() => toast("Workspace settings", { description: "Settings is available in Administration." })} className="hover:text-white"><Settings2 size={15} /></button>
          <button onClick={() => toast("Session secured", { description: "Your administrator session is active." })} className="hover:text-white"><LockKeyhole size={15} /></button>
        </div>
      </div>
    </aside>
  );
}
