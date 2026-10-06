import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Globe2,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Server,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { AppUser } from "@/components/Auth";
import { useQueueCount } from "@/contexts/QueueCountContext";
import { cn } from "@/lib/utils";

export function Topbar({
  title,
  subtitle,
  onMenu,
  collapsed,
  onCollapse,
  user,
  authenticatedRole,
  availablePerspectives = [],
  onRoleSwitch,
}: {
  title: string;
  subtitle: string;
  onMenu: () => void;
  collapsed: boolean;
  onCollapse: () => void;
  user: AppUser;
  authenticatedRole?: AppUser["role"];
  availablePerspectives?: AppUser["role"][];
  onRoleSwitch: (role: AppUser["role"]) => void;
}) {
  const { notificationCount } = useQueueCount();
  const [, navigate] = useLocation();

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
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
        {/* Dedicated Single-Client Workspace & Pipeline Badges commented out per request */}
        {/*
        <div className="hidden items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-[10px] shadow-sm md:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-bold text-[#0e0e0e]">Client</span>
          <span className="text-stone-400">·</span>
          <span className="font-semibold text-stone-600">Dedicated Workspace</span>
        </div>

        <div className="hidden items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-[10px] shadow-sm md:flex">
          <span className="font-bold text-[#0e0e0e]">Prior Auth Pipeline</span>
          <span className="rounded-md bg-[#45bd8d]/15 px-2 py-0.5 text-[9px] font-bold text-[#1f845d]">
            Azure Production
          </span>
        </div>
        */}

        {/* NOTIFICATIONS DROPDOWN */}
        <div className="relative" ref={notificationsRef}>
          <button
            aria-label="Notifications"
            onClick={() => {
              setNotificationsOpen(!notificationsOpen);
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
      </div>
    </header>
  );
}
