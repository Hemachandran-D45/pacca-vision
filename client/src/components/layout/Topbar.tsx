import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Cloud,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Server,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { MockUser } from "@/components/MockAuth";
import { useQueueCount } from "@/contexts/QueueCountContext";
import { cn } from "@/lib/utils";

export function Topbar({
  title,
  subtitle,
  onMenu,
  collapsed,
  onCollapse,
  user,
  canSwitchPerspective = false,
  onRoleSwitch,
}: {
  title: string;
  subtitle: string;
  onMenu: () => void;
  collapsed: boolean;
  onCollapse: () => void;
  user: MockUser;
  canSwitchPerspective?: boolean;
  onRoleSwitch: (role: MockUser["role"]) => void;
}) {
  const { notificationCount } = useQueueCount();
  const [, navigate] = useLocation();

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const notificationsRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
      if (helpRef.current && !helpRef.current.contains(event.target as Node)) {
        setHelpOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex min-h-[76px] items-center justify-between gap-3 border-b border-stone-200 bg-[#f2f2f0]/95 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
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
        {/* Perspective Switcher for Platform Admin; static Role badge for non-admin personas */}
        {canSwitchPerspective ? (
          <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-[10px] shadow-sm">
            <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400">Perspective</span>
            <select
              aria-label="Switch demo perspective"
              value={user.role}
              onChange={(e) => onRoleSwitch(e.target.value as MockUser["role"])}
              className="cursor-pointer bg-transparent font-semibold text-[#0e0e0e] outline-none hover:text-[#47a2b0] transition"
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
            Azure Production
          </span>
        </div>

        <label className="hidden h-9 w-[245px] items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 shadow-sm lg:flex focus-within:border-[#47a2b0] focus-within:ring-1 focus-within:ring-[#47a2b0]">
          <Search size={15} className="text-stone-400" />
          <input
            className="w-full bg-transparent text-[11px] outline-none placeholder:text-stone-400"
            placeholder="Search documents, IDs, fields..."
          />
        </label>

        {/* NOTIFICATIONS DROPDOWN */}
        <div className="relative" ref={notificationsRef}>
          <button
            aria-label="Notifications"
            onClick={() => {
              setNotificationsOpen(!notificationsOpen);
              setHelpOpen(false);
            }}
            className={cn(
              "relative rounded-xl p-2 text-stone-500 transition hover:bg-white",
              notificationsOpen && "bg-white text-[#47a2b0] shadow-xs"
            )}
          >
            <Bell size={18} />
            {notificationCount > 0 && (
              <span className="absolute right-1 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e04f4f] px-1 text-[9px] font-bold text-white shadow-xs">
                {notificationCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-display text-[14px] font-bold text-[#0e0e0e]">Notifications</span>
                  {notificationCount > 0 ? (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                      {notificationCount} new
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                      All caught up
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setNotificationsOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 transition"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="mt-3 space-y-2.5 max-h-[380px] overflow-y-auto">
                {/* HIL Review Notification */}
                {notificationCount > 0 ? (
                  <div
                    onClick={() => {
                      setNotificationsOpen(false);
                      navigate("/hil-review");
                    }}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200/80 bg-amber-50/60 p-3 transition hover:bg-amber-50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                      <AlertTriangle size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-amber-900">Awaiting HIL Review</span>
                        <span className="text-[9px] text-amber-700 font-semibold">Active</span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-amber-800 leading-relaxed">
                        {notificationCount} document{notificationCount === 1 ? "" : "s"} require manual field validation or rule approval.
                      </p>
                      <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-[#47a2b0] hover:underline">
                        Open HIL Review Queue <ChevronRight size={12} />
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <CheckCircle2 size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold text-emerald-900">Review Queue Clear</div>
                      <p className="mt-0.5 text-[10px] text-emerald-700">
                        All incoming documents processed with high straight-through processing rate.
                      </p>
                    </div>
                  </div>
                )}

                {/* Azure Pipeline Telemetry Notification */}
                <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                    <Server size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-800">Azure Pipeline Active</span>
                      <span className="text-[9px] text-emerald-600 font-bold">100% Healthy</span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-500 leading-relaxed">
                      Azure AI Document Intelligence & OpenAI GPT-4o workers healthy. Latency 6.4s median.
                    </p>
                  </div>
                </div>

                {/* Storage & DB Status */}
                <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-700">
                    <Cloud size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-800">Azure Blob & Cosmos DB</span>
                      <span className="text-[9px] text-emerald-600 font-bold">Connected</span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-500 leading-relaxed">
                      Container SAS delegation active with enterprise encryption at rest.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 border-t border-slate-100 pt-2.5">
                <button
                  onClick={() => {
                    setNotificationsOpen(false);
                    navigate("/monitor");
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[10px] font-bold text-[#47a2b0] hover:bg-slate-50 transition"
                >
                  View full telemetry in Pipeline Monitor <ArrowRight size={12} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* HELP DROPDOWN */}
        <div className="relative" ref={helpRef}>
          <button
            aria-label="Help"
            onClick={() => {
              setHelpOpen(!helpOpen);
              setNotificationsOpen(false);
            }}
            className={cn(
              "hidden rounded-xl p-2 text-stone-500 transition hover:bg-white sm:block",
              helpOpen && "bg-white text-[#47a2b0] shadow-xs"
            )}
          >
            <CircleHelp size={18} />
          </button>

          {helpOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <span className="font-display text-[13px] font-bold text-[#0e0e0e]">Support & Runbooks</span>
                <button onClick={() => setHelpOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                  <X size={13} />
                </button>
              </div>
              <div className="mt-2.5 space-y-1.5 text-[11px]">
                <div className="rounded-xl p-2 hover:bg-slate-50 cursor-pointer">
                  <div className="font-bold text-slate-800">Workspace Runbook</div>
                  <div className="text-[10px] text-slate-400">Azure deployment guidelines & SLA policies</div>
                </div>
                <div className="rounded-xl p-2 hover:bg-slate-50 cursor-pointer">
                  <div className="font-bold text-slate-800">Document Type Schemas</div>
                  <div className="text-[10px] text-slate-400">Class A-D field guidance and rules</div>
                </div>
                <div className="rounded-xl p-2 hover:bg-slate-50 cursor-pointer">
                  <div className="font-bold text-slate-800">Security & Compliance</div>
                  <div className="text-[10px] text-slate-400">FedRAMP High & HIPAA architecture on Azure</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
