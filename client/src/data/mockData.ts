import {
  Activity,
  BarChart3,
  BrainCircuit,
  Cloud,
  Columns3,
  FileCheck2,
  FileCog,
  FileSearch,
  FileText,
  GitBranch,
  HardDrive,
  Inbox,
  Network,
  Send,
  Settings2,
  ShieldCheck,
  UserRound,
  UsersRound,
  WandSparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = { label: string; path: string; icon: LucideIcon; badge?: string };
export type NavSection = { label: string; items: NavItem[] };

export type DocumentRow = {
  id: string;
  file: string;
  type: string;
  source: string;
  status: "Processed" | "Needs Review" | "HIL Review" | "Validation failed" | "Processing";
  confidence: string;
  pages: number;
  received: string;
  color: string;
  pdfUrl: string;
  previewUrl: string;
};

export const navSections: NavSection[] = [
  {
    label: "Operate",
    items: [
      { label: "Dashboard", path: "/", icon: Activity },
      { label: "Documents", path: "/documents", icon: FileText },
      { label: "HIL Review", path: "/hil-review", icon: UserRound, badge: "27" },
      { label: "Pipeline Monitor", path: "/monitor", icon: GitBranch },
      { label: "Analytics & Cost", path: "/analytics", icon: BarChart3 },
      { label: "Audit Trail", path: "/audit", icon: FileSearch },
    ],
  },
  {
    label: "Configure",
    items: [
      { label: "Solutions", path: "/solutions-v2", icon: FileCog },
      { label: "Pipeline Studio", path: "/pipeline-studio", icon: WandSparkles },
      { label: "Metadata Studio", path: "/metadata-studio", icon: Columns3 },
      { label: "Rules & Validations", path: "/rules", icon: ShieldCheck },
      { label: "Integrations", path: "/integrations", icon: Network },
    ],
  },
  {
    label: "Deploy",
    items: [
      { label: "Environment", path: "/environment", icon: Cloud },
      { label: "Deployment Wizard", path: "/deployment", icon: Send },
      { label: "Infrastructure", path: "/infrastructure", icon: HardDrive },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users & Roles", path: "/users", icon: UsersRound },
      { label: "Settings", path: "/settings", icon: Settings2 },
    ],
  },
];

export type HilField = {
  name: string;
  key: string;
  value: string;
  originalValue?: string;
  confidence: number;
  flagged?: boolean;
  type?: "text" | "date" | "number" | "currency" | "textarea";
};

export type HilItem = {
  id: string;
  file: string;
  title: string;
  docType: string;
  patientOrVendor: string;
  confidence: number;
  pages: number;
  uploadedBy: string;
  uploadedAt: string;
  status: "Needs Review" | "In Review" | "Approved" | "Rejected";
  priority: "High" | "Medium" | "Low";
  age: string;
  flagCount: number;
  pdfUrl?: string;
  summary: string;
  fields: HilField[];
};

export const DOCUMENT_TYPES = [
  "All Document Types",
  "Prior Authorization",
  "Invoice",
  "Clinical Notes",
  "CMS-1500 Claim",
] as const;

export const documents: DocumentRow[] = [
  {
    id: "DOC-PA-001",
    file: "Edha_Maldonado_PriorAuth.pdf",
    type: "Prior Authorization",
    source: "IHCS Auto-intake",
    status: "Processed",
    confidence: "95%",
    pages: 1,
    received: "Today, 13:59",
    color: "#45bd8d",
    pdfUrl: "/pdfs/invoice_001.pdf",
    previewUrl: "/pdfs/invoice_001.pdf",
  },
  {
    id: "DOC-PA-002",
    file: "Maria_Formoso_Rx.pdf",
    type: "Prior Authorization",
    source: "Fax Gateway",
    status: "Needs Review",
    confidence: "69%",
    pages: 2,
    received: "Today, 13:42",
    color: "#f2c94c",
    pdfUrl: "/pdfs/invoice_002.pdf",
    previewUrl: "/pdfs/invoice_002.pdf",
  },
  {
    id: "DOC-INV-001",
    file: "invoice_001_Apex.pdf",
    type: "Invoice",
    source: "AP Ingest",
    status: "Processed",
    confidence: "98%",
    pages: 1,
    received: "Today, 14:02",
    color: "#45bd8d",
    pdfUrl: "/pdfs/invoice_001.pdf",
    previewUrl: "/pdfs/invoice_001.pdf",
  },
  {
    id: "DOC-INV-002",
    file: "invoice_002_GlobalOffice.pdf",
    type: "Invoice",
    source: "AP Ingest",
    status: "Needs Review",
    confidence: "68%",
    pages: 1,
    received: "Today, 13:58",
    color: "#f2c94c",
    pdfUrl: "/pdfs/invoice_003.pdf",
    previewUrl: "/pdfs/invoice_003.pdf",
  },
  {
    id: "DOC-CN-001",
    file: "James_Wilson_Discharge.pdf",
    type: "Clinical Notes",
    source: "EHR Bridge",
    status: "Processed",
    confidence: "92%",
    pages: 3,
    received: "Today, 12:30",
    color: "#45bd8d",
    pdfUrl: "/pdfs/invoice_003.pdf",
    previewUrl: "/pdfs/invoice_003.pdf",
  },
  {
    id: "DOC-CLM-001",
    file: "CMS1500_Claim_884210.pdf",
    type: "CMS-1500 Claim",
    source: "Clearinghouse EDI",
    status: "Processed",
    confidence: "94%",
    pages: 1,
    received: "Today, 11:15",
    color: "#45bd8d",
    pdfUrl: "/pdfs/invoice_001.pdf",
    previewUrl: "/pdfs/invoice_001.pdf",
  },
];

export const hilQueue: HilItem[] = [
  {
    id: "DOC-PA-002",
    file: "Maria_Formoso_Rx.pdf",
    title: "María de los angeles Formoso — Prescription",
    docType: "Prior Authorization",
    patientOrVendor: "María de los angeles Formoso",
    confidence: 69,
    pages: 2,
    uploadedBy: "Fax Gateway",
    uploadedAt: "Today, 13:42",
    status: "Needs Review",
    priority: "High",
    age: "24 min ago",
    flagCount: 2,
    pdfUrl: "/pdfs/invoice_002.pdf",
    summary:
      "Specialty prescription requiring human validation of handwritten dosage instructions and attending physician NPI.",
    fields: [
      { name: "Drug directions", key: "directions", value: "Twice daily with meals", confidence: 64, flagged: true, type: "text" },
      { name: "Dose form", key: "dose_form", value: "Oral Tablet 25mg", confidence: 68, flagged: true, type: "text" },
      { name: "Patient name", key: "patient_name", value: "María de los angeles Formoso", confidence: 98, type: "text" },
      { name: "Patient address", key: "address", value: "1420 Brickell Bay Dr, Apt 902, Miami, FL 33131", confidence: 91, type: "text" },
      { name: "Provider NPI", key: "provider_npi", value: "1700873734", confidence: 96, type: "text" },
      { name: "Provider phone", key: "provider_phone", value: "954-843-9443", confidence: 94, type: "text" },
      { name: "Signature", key: "signature", value: "Present (Verified on Page 2)", confidence: 90, type: "text" },
    ],
  },
  {
    id: "DOC-INV-002",
    file: "invoice_002_GlobalOffice.pdf",
    title: "Global Office Supplies — INV-2026-002",
    docType: "Invoice",
    patientOrVendor: "Global Office Supplies",
    confidence: 68,
    pages: 1,
    uploadedBy: "AP Ingest",
    uploadedAt: "Today, 13:58",
    status: "Needs Review",
    priority: "Medium",
    age: "36 min ago",
    flagCount: 1,
    pdfUrl: "/pdfs/invoice_003.pdf",
    summary:
      "Accounts-payable invoice capture for office equipment. Flagged for review due to line-item tax mismatch.",
    fields: [
      { name: "Total amount", key: "total_amount", value: "₹49,560", confidence: 62, flagged: true, type: "currency" },
      { name: "Vendor name", key: "vendor_name", value: "Global Office Supplies", confidence: 97, type: "text" },
      { name: "Invoice number", key: "invoice_number", value: "INV-2026-002", confidence: 96, type: "text" },
      { name: "Invoice date", key: "invoice_date", value: "29-Aug-2026", confidence: 95, type: "date" },
      { name: "Purchase order", key: "purchase_order", value: "PO-45822", confidence: 94, type: "text" },
      { name: "Subtotal", key: "subtotal", value: "₹42,000", confidence: 92, type: "currency" },
      { name: "Tax amount", key: "tax_amount", value: "₹7,560", confidence: 90, type: "currency" },
      { name: "Due date", key: "due_date", value: "28-Sep-2026", confidence: 94, type: "date" },
    ],
  },
  {
    id: "DOC-PA-003",
    file: "Robert_Chen_PriorAuth.pdf",
    title: "Robert Chen — Clinical Prior Auth",
    docType: "Prior Authorization",
    patientOrVendor: "Robert Chen",
    confidence: 71,
    pages: 1,
    uploadedBy: "Fax Gateway",
    uploadedAt: "Today, 13:10",
    status: "Needs Review",
    priority: "High",
    age: "45 min ago",
    flagCount: 1,
    pdfUrl: "/pdfs/invoice_001.pdf",
    summary:
      "Specialty prior authorization packet missing required attending physician NPI. Requires human input.",
    fields: [
      { name: "Provider NPI", key: "provider_npi", value: "", confidence: 0, flagged: true, type: "text" },
      { name: "Patient name", key: "patient_name", value: "Robert Chen", confidence: 98, type: "text" },
      { name: "Date of birth", key: "dob", value: "11/04/1975", confidence: 97, type: "date" },
      { name: "Member ID", key: "member_id", value: "55829104", confidence: 99, type: "text" },
      { name: "Insurance type", key: "insurance_type", value: "Humana Medicare Advantage", confidence: 96, type: "text" },
      { name: "Patient address", key: "address", value: "712 Ocean Blvd, Boca Raton, FL 33432", confidence: 94, type: "text" },
    ],
  },
];

export const stageData = [
  { name: "Ingest", count: "128", delta: "+12", icon: Inbox, tone: "green" },
  { name: "Preprocess", count: "128", delta: "+8", icon: WandSparkles, tone: "green" },
  { name: "Understand", count: "97", delta: "+5", icon: BrainCircuit, tone: "green" },
  { name: "Extract", count: "63", delta: "+3", icon: FileCheck2, tone: "green" },
  { name: "Validate", count: "34", delta: "+6", icon: ShieldCheck, tone: "amber" },
  { name: "HIL Review", count: "27", delta: "+8", icon: UserRound, tone: "red" },
  { name: "Deliver", count: "4,785", delta: "+302", icon: Send, tone: "blue" },
];

export const trendData = [
  { day: "May 02", processed: 1170, hil: 520 },
  { day: "May 03", processed: 1390, hil: 410 },
  { day: "May 04", processed: 1410, hil: 600 },
  { day: "May 05", processed: 1260, hil: 490 },
  { day: "May 06", processed: 1580, hil: 560 },
  { day: "May 07", processed: 1480, hil: 430 },
  { day: "May 08", processed: 1430, hil: 530 },
];

export const costData = [
  { label: "Document understanding (representative)", value: 203.3, percent: 42, color: "#47a2b0" },
  { label: "LLM extraction (representative)", value: 135.2, percent: 28, color: "#b89dcb" },
  { label: "Compute orchestration (representative)", value: 86.4, percent: 18, color: "#00b0f0" },
  { label: "Storage (S3)", value: 33.2, percent: 7, color: "#606b72" },
  { label: "Others", value: 24.5, percent: 5, color: "#a0aab0" },
];

export const analyticsData = [
  { day: "Mon", processed: 590, hil: 68, failed: 14 },
  { day: "Tue", processed: 730, hil: 81, failed: 10 },
  { day: "Wed", processed: 680, hil: 74, failed: 16 },
  { day: "Thu", processed: 820, hil: 88, failed: 12 },
  { day: "Fri", processed: 760, hil: 75, failed: 8 },
  { day: "Sat", processed: 510, hil: 55, failed: 11 },
  { day: "Sun", processed: 720, hil: 65, failed: 9 },
];
