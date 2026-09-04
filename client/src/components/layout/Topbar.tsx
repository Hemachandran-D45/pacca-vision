import { Bell, CircleHelp, Menu, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { toast } from "sonner";
import type { MockUser } from "@/components/MockAuth";

export function Topbar({
  title,
  subtitle,
  onMenu,
  collapsed,
  onCollapse,
  user,
  onRoleSwitch,
}: {
  title: string;
  subtitle: string;
  onMenu: () => void;
  collapsed: boolean;
  onCollapse: () => void;
  user: MockUser;
  onRoleSwitch: (role: MockUser["role"]) => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex min-h-[76px] items-center justify-between gap-3 border-b border-stone-200 bg-[#f2f2f0]/95 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={onMenu} className="rounded-xl p-2 text-stone-500 hover:bg-white lg:hidden">
          <Menu size={19} />
        </button>
        <button onClick={onCollapse} className="hidden rounded-xl p-2 text-stone-400 hover:bg-white lg:block">
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <div className="min-w-0">
          <h1 className="truncate font-display text-[22px] font-bold tracking-[-0.04em] text-[#0e0e0e] sm:text-[25px]">
            {title}
          </h1>
          <p className="hidden truncate text-[11px] text-stone-500 sm:block">{subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {user.role === "PACCA Platform Admin" ? (
          <div className="hidden items-center gap-2 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-[10px] shadow-sm md:flex">
            <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400">Perspective</span>
            <select
              aria-label="Switch demo perspective"
              value={user.role}
              onChange={(e) => onRoleSwitch(e.target.value as MockUser["role"])}
              className="max-w-[155px] cursor-pointer bg-transparent font-semibold text-[#0e0e0e] outline-none"
            >
              <option value="PACCA Platform Admin">PACCA Platform Admin</option>
              <option value="PACCA Solution Developer">PACCA Solution Developer</option>
              <option value="Client Staff">Client Staff</option>
            </select>
          </div>
        ) : (
          <div className="hidden items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-[10px] shadow-sm md:flex">
            <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400">Role</span>
            <span className="font-semibold text-[#0e0e0e]">{user.role}</span>
          </div>
        )}

        <div className="hidden items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-[10px] shadow-sm md:flex">
          <span className="font-bold text-[#0e0e0e]">Client Workspace</span>
          <span className="ml-1 rounded-md bg-[#45bd8d]/15 px-2 py-0.5 text-[9px] font-bold text-[#1f845d]">
            Production
          </span>
        </div>

        <label className="hidden h-9 w-[245px] items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 shadow-sm lg:flex focus-within:border-[#47a2b0] focus-within:ring-1 focus-within:ring-[#47a2b0]">
          <Search size={15} className="text-stone-400" />
          <input
            className="w-full bg-transparent text-[11px] outline-none placeholder:text-stone-400"
            placeholder="Search documents, IDs, fields..."
          />
        </label>

        <button
          aria-label="Notifications"
          onClick={() => toast("You’re all caught up", { description: "No new operational alerts." })}
          className="relative rounded-xl p-2 text-stone-500 hover:bg-white"
        >
          <Bell size={18} />
          <span className="absolute right-1 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e04f4f] px-1 text-[9px] font-bold text-white">
            12
          </span>
        </button>

        <button
          aria-label="Help"
          onClick={() => toast("PACCA Vision support", { description: "Your workspace runbook is available from the Help Center." })}
          className="hidden rounded-xl p-2 text-stone-500 hover:bg-white sm:block"
        >
          <CircleHelp size={18} />
        </button>

        <button
          onClick={() => toast(`Signed in as ${user.name}`, { description: `${user.role} · ${user.tenant}` })}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#47a2b0] text-xs font-bold text-white shadow-[0_3px_8px_rgba(71,162,176,.3)]"
        >
          {user.initials}
        </button>
      </div>
    </header>
  );
}
