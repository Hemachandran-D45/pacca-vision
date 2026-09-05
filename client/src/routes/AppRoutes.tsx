import { lazy, Suspense } from "react";
import { SkeletonPage } from "@/components/MockAuth";
import type { MockUser } from "@/components/MockAuth";

const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage"));
const DocumentsPage = lazy(() => import("@/pages/documents/DocumentsPage"));
const DocumentDetailPage = lazy(() => import("@/pages/documents/DocumentDetailPage"));
const HilReviewPage = lazy(() => import("@/pages/hil-review/HilReviewPage"));
const PipelineMonitorPage = lazy(() => import("@/pages/pipeline-monitor/PipelineMonitorPage"));
const AnalyticsPage = lazy(() => import("@/pages/analytics/AnalyticsPage"));
const AuditPage = lazy(() => import("@/pages/audit/AuditPage"));
const SolutionsPage = lazy(() => import("@/pages/solutions/SolutionsPage"));
const PipelineStudioPage = lazy(() => import("@/pages/studios/PipelineStudioPage"));
const MetadataStudioPage = lazy(() => import("@/pages/studios/MetadataStudioPage"));
const ConfigListPage = lazy(() => import("@/pages/config/ConfigListPage"));
const DeployPage = lazy(() => import("@/pages/deploy/DeployPage"));
const AdminPage = lazy(() => import("@/pages/admin/AdminPage"));

export function AppRoutes({
  path,
  user,
  hilFocus,
  onNavigate,
  onOpenDocument,
  onOpenHil,
}: {
  path: string;
  user: MockUser;
  hilFocus: string | null;
  onNavigate: (path: string) => void;
  onOpenDocument: (documentId: string) => void;
  onOpenHil: (documentId: string) => void;
}) {
  const detailMatch = path.match(/^\/documents\/(.+)$/);

  return (
    <Suspense fallback={<SkeletonPage />}>
      {(() => {
        if (detailMatch) {
          return (
            <DocumentDetailPage
              id={decodeURIComponent(detailMatch[1])}
              onBack={() => onNavigate("/documents")}
              onNavigate={onNavigate}
              onReview={onOpenHil}
            />
          );
        }
        if (path === "/") {
          return <DashboardPage onNavigate={onNavigate} onOpenDocument={onOpenDocument} />;
        }
        if (path === "/documents") {
          return <DocumentsPage onNavigate={onNavigate} onOpenDocument={onOpenDocument} onOpenHil={onOpenHil} />;
        }
        if (path === "/hil-review") {
          return (
            <HilReviewPage
              userEmail={user.email}
              userName={user.name}
              focusDocumentId={hilFocus}
            />
          );
        }
        if (path === "/monitor") {
          return <PipelineMonitorPage />;
        }
        if (path === "/analytics") {
          return <AnalyticsPage />;
        }
        if (path === "/audit") {
          return <AuditPage />;
        }
        if (path === "/solutions-v2" || path === "/solutions") {
          return <SolutionsPage />;
        }
        if (path === "/pipeline-studio") {
          return <PipelineStudioPage />;
        }
        if (path === "/metadata-studio") {
          return <MetadataStudioPage />;
        }
        if (path === "/rules") {
          return <ConfigListPage kind="rules" />;
        }
        if (path === "/integrations") {
          return <ConfigListPage kind="integrations" />;
        }
        if (path === "/environment") {
          return <DeployPage kind="environment" />;
        }
        if (path === "/deployment") {
          return <DeployPage kind="deployment" />;
        }
        if (path === "/infrastructure") {
          return <DeployPage kind="infrastructure" />;
        }
        if (path === "/users") {
          return <AdminPage kind="users" />;
        }
        if (path === "/settings") {
          return <AdminPage kind="settings" />;
        }
        return <DashboardPage onNavigate={onNavigate} onOpenDocument={onOpenDocument} />;
      })()}
    </Suspense>
  );
}
