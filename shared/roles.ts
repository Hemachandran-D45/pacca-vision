/**
 * Who sees which page, and which API routes each page calls.
 *
 * Shared by the client (tabs, client/src/components/Auth.tsx) and the test
 * that keeps the two sides honest (tests/server/page-routes.test.ts). The
 * server's own guard is ROUTE_POLICY in server/senderra/api.ts.
 *
 * A page is only usable if every route it calls allows the role that can see
 * the page. That mismatch shipped once — Observability was visible to
 * Developers but loaded its data from an Admin-only route — so the test checks
 * every visible page against PAGE_API_ROUTES. Add a page's routes here when
 * you add a page or a call.
 */
export type Role = "PACCA Platform Admin" | "PACCA Solution Developer" | "Client Staff";

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
  "PACCA Platform Admin": [...DEVELOPER_PATHS, "/analytics", "/settings", "/users", "/central-admin"],
};

export const visiblePaths = (role: Role): string[] =>
  rolePermissions[role].filter((path) => !DEMO_HIDDEN_PATHS.has(path));

/** `/api/senderra` routes each visible page calls, as "METHOD /route". */
export const PAGE_API_ROUTES: Record<string, string[]> = {
  // DashboardPage + UploadDocumentModal
  "/": ["GET /documents", "GET /stats", "POST /upload-sas", "GET /models"],
  // DocumentsPage + UploadDocumentModal + DocumentDetailLive + IvrOutreachButton
  "/documents": ["GET /documents", "POST /upload-sas", "GET /models", "GET /document", "POST /ivr-trigger"],
  "/hil-review": ["GET /documents", "GET /document", "POST /review", "POST /ivr-trigger"],
  "/monitor": ["GET /documents", "GET /stats"],
  "/observability": [
    "GET /analytics",
    "GET /observability",
    "GET /observability/gaps",
    "POST /observability/chat",
    "POST /kql",
    "POST /observability/diagnose",
  ],
  // Solutions talk to /api/solutions-v2, guarded separately at Solution Developer.
  "/solutions": [],
  "/solutions-v2": [],
  "/analytics": ["GET /analytics", "GET /documents", "GET /stats"],
  "/settings": ["GET /models", "GET /llm-settings", "POST /llm-settings"],
};
