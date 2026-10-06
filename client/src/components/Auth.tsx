import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Logo } from "@/components/common/Logo";
import { signIn } from "@/senderra/api";

/**
 * Who is signed in, and which tabs each role sees.
 *
 * The session itself lives in an httpOnly cookie the browser cannot read; the
 * user object here comes from GET /api/senderra/me. `rolePermissions` mirrors
 * ROUTE_POLICY in server/senderra/api.ts — keep the two in step. Hiding a tab
 * is presentation only: the server refuses the API calls behind it regardless.
 */
type Role =
  "PACCA Platform Admin" | "PACCA Solution Developer" | "Client Staff";
export type AppUser = {
  name: string;
  initials: string;
  email: string;
  role: Role;
  tenant: string;
  tenantCode: string;
  experience?: "central" | "client";
};

export type SessionUser = { email: string; name: string; role: Role };

export function toAppUser(session: SessionUser): AppUser {
  const initials = session.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]!.toUpperCase())
    .join("");
  return {
    ...session,
    initials: initials || session.email.slice(0, 2).toUpperCase(),
    tenant: "Client",
    tenantCode: "CLIENT",
    experience: "client",
  };
}

/** Screens that exist but are still static mock-ups; hidden for every role. */
export const DEMO_HIDDEN_PATHS = new Set([
  "/environment",
  "/users",
  "/integrations",
  "/pipeline-studio",
  "/metadata-studio",
  "/rules",
  "/deployment",
  "/infrastructure",
  "/central-admin",
]);

export const demoAllowedPaths = (role: Role): string[] =>
  rolePermissions[role].filter(path => !DEMO_HIDDEN_PATHS.has(path));

const STAFF_PATHS = ["/", "/documents", "/hil-review", "/monitor"];
const DEVELOPER_PATHS = [
  ...STAFF_PATHS,
  "/observability",
  "/solutions",
  "/solutions-v2",
  "/pipeline-studio",
  "/metadata-studio",
  "/rules",
  "/integrations",
  "/deployment",
  "/infrastructure",
];

export const rolePermissions: Record<Role, string[]> = {
  // Operates documents: upload (with a per-upload model), review, monitor.
  "Client Staff": STAFF_PATHS,
  // + doc types (Solutions) and pipeline diagnostics (Observability).
  "PACCA Solution Developer": DEVELOPER_PATHS,
  // + cost / ROI (Analytics), the global model switch (Settings) and users.
  "PACCA Platform Admin": [
    ...DEVELOPER_PATHS,
    "/analytics",
    "/settings",
    "/users",
    "/central-admin",
  ],
};

/** An admin can preview the app as a lower role; nobody can go upward. */
export function getAvailablePerspectives(authenticatedRole: Role): Role[] {
  if (authenticatedRole === "PACCA Platform Admin") {
    return ["PACCA Platform Admin", "PACCA Solution Developer", "Client Staff"];
  }
  if (authenticatedRole === "PACCA Solution Developer") {
    return ["PACCA Solution Developer", "Client Staff"];
  }
  return [];
}

type LoginProps = { onLogin: (user: SessionUser) => void };

export function LoginScreen({ onLogin }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalised = email.trim().toLowerCase();
    if (!normalised.endsWith("@emids.com")) {
      setError("Use your @emids.com email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { user } = await signIn(normalised, password);
      setPassword("");
      onLogin(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-[#0e0e0e] text-white">
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle at 78% 22%, rgba(71,162,176,.28), transparent 26%), radial-gradient(circle at 18% 88%, rgba(69,189,141,.16), transparent 24%)",
        }}
      />
      <div className="relative hidden w-[48%] flex-col justify-between border-r border-white/10 p-10 lg:flex xl:p-16">
        <Logo size="lg" />
        <div className="max-w-md">
          <div className="mb-5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#47a2b0]">
            <span className="h-2 w-2 rounded-full bg-[#45bd8d]" /> Platform
            access
          </div>
          <h1 className="font-display text-5xl font-bold leading-[1.06] tracking-[-.06em]">
            Operate every document with{" "}
            <span className="text-[#47a2b0]">confidence.</span>
          </h1>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-slate-300">
            A reusable, cloud-agnostic operations layer for document intake,
            processing, human review, and trusted final metadata.
          </p>
        </div>
        <div className="text-[10px] text-slate-500">
          PACCA Vision · Reusable Intelligent Document Processing Operations
          Platform
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-[430px]">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <div className="rounded-[26px] border border-white/12 bg-white p-6 text-[#0e0e0e] shadow-[0_24px_80px_rgba(0,0,0,.28)] sm:p-8">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#47a2b0]">
                  Client workspace access
                </div>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-[-.05em]">
                  Sign in to PACCA
                </h2>
                <p className="mt-2 text-[11px] text-slate-500">
                  Dedicated intelligent document processing operations
                  workspace.
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ebf5f7] text-[#47a2b0]">
                <ShieldCheck size={18} />
              </div>
            </div>

            <form className="mt-7 space-y-4" onSubmit={submit}>
              <div className="block">
                <span className="mb-2 block text-[10px] font-bold text-slate-500">
                  Authorized workspace
                </span>
                <div className="flex h-11 items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 text-[11px] font-semibold text-slate-700">
                  <span>Client</span>
                  <span className="text-[9px] font-bold text-[#45bd8d]">
                    Authorized
                  </span>
                </div>
              </div>

              <label className="block">
                <span className="mb-2 block text-[10px] font-bold text-slate-500">
                  Email
                </span>
                <input
                  type="email"
                  autoComplete="username"
                  placeholder="name@emids.com"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[11px] text-slate-700 outline-none focus:border-[#47a2b0]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[10px] font-bold text-slate-500">
                  Password
                </span>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[11px] text-slate-700 outline-none focus:border-[#47a2b0]"
                />
              </label>

              {error && (
                <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#47a2b0] text-[11px] font-bold text-white shadow-[0_9px_20px_rgba(71,162,176,.22)] hover:bg-[#37828e] disabled:opacity-60"
              >
                {busy ? "Signing in…" : "Continue to workspace"} <ArrowRight size={15} />
              </button>
            </form>

          </div>
          <div className="mt-5 flex items-center justify-center gap-2 text-[9px] text-slate-500">
            <LockKeyhole size={12} /> Signed session · @emids.com accounts
            only
          </div>
        </div>
      </div>
    </div>
  );
}

export function SkeletonPage() {
  return (
    <div className="animate-pulse space-y-6 p-4 sm:p-7 lg:p-9">
      <div className="flex items-end justify-between">
        <div>
          <div className="h-3 w-40 rounded bg-slate-200" />
          <div className="mt-3 h-7 w-64 rounded-lg bg-slate-200" />
        </div>
        <div className="h-9 w-28 rounded-xl bg-slate-200" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[1, 2, 3, 4, 5].map(item => (
          <div
            key={item}
            className="h-[176px] rounded-2xl border border-slate-200/80 bg-white p-5"
          >
            <div className="h-9 w-9 rounded-xl bg-slate-100" />
            <div className="mt-6 h-3 w-24 rounded bg-slate-100" />
            <div className="mt-3 h-7 w-20 rounded bg-slate-200" />
            <div className="mt-8 h-8 w-full rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-[310px] rounded-2xl border border-slate-200/80 bg-white" />
        <div className="h-[310px] rounded-2xl border border-slate-200/80 bg-white" />
      </div>
    </div>
  );
}

export function AccessDenied({
  role,
  onNavigate,
}: {
  role: Role;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="flex min-h-[calc(100vh-76px)] items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-amber-200 bg-white p-7 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <LockKeyhole size={21} />
        </div>
        <h2 className="mt-5 font-display text-xl font-bold text-[#0e0e0e]">
          Permission required
        </h2>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          Your current role, <strong>{role}</strong>, does not have access to
          this area. Choose another area, or ask a Platform Admin for access.
        </p>
        <button
          onClick={() => onNavigate("/")}
          className="mt-5 rounded-xl bg-[#47a2b0] px-4 py-2.5 text-[10px] font-bold text-white hover:bg-[#37828e]"
        >
          Return to Command Center
        </button>
      </div>
    </div>
  );
}

export type { Role };
