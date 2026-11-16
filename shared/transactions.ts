import { z } from "zod";

/**
 * PACCA Vision V2.0 — Multi-Document Packet & Transaction Ledger Schemas
 *
 * In enterprise IDP (ABBYY Vantage, Hyperscience, Rossum), documents are rarely
 * processed in total isolation. An intake event (Prior Auth packet, Commercial Invoice
 * bundle, Mortgage application, Clinical onboarding) contains 1 to N related documents
 * that form a single transaction.
 */

export const TransactionChannelSchema = z.enum([
  "api",
  "portal",
  "email",
  "sftp",
  "fax",
  "batch",
]);
export type TransactionChannel = z.infer<typeof TransactionChannelSchema>;

export const TransactionPrioritySchema = z.enum(["urgent", "high", "normal", "low"]);
export type TransactionPriority = z.infer<typeof TransactionPrioritySchema>;

export const TransactionStatusSchema = z.enum([
  "ingested",
  "classifying",
  "extracting",
  "validating",
  "needs_review",
  "in_review",
  "approved",
  "rejected",
  "exported",
  "failed",
]);
export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;

export const PacketDocumentSchema = z.object({
  documentId: z.string(),
  name: z.string(),
  docType: z.string().nullable().optional(),
  status: z.string(),
  confidence: z.number().nullable().optional(),
  pageCount: z.number().nullable().optional(),
  fileBytes: z.number().nullable().optional(),
  isAttachment: z.boolean().default(false),
  uploadedAt: z.string(),
});
export type PacketDocument = z.infer<typeof PacketDocumentSchema>;

export const CrossDocFindingSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  title: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  status: z.enum(["passed", "failed", "pending"]),
  sourceDocId: z.string(),
  targetDocId: z.string(),
  sourceField: z.string(),
  targetField: z.string(),
  details: z.string(),
});
export type CrossDocFinding = z.infer<typeof CrossDocFindingSchema>;

export const AuditEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  actor: z.string(),
  action: z.string(),
  details: z.string().optional(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export const TransactionSummarySchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  title: z.string(),
  caseNumber: z.string(),
  channel: TransactionChannelSchema,
  status: TransactionStatusSchema,
  priority: TransactionPrioritySchema,
  slaDueAt: z.string(),
  isSlaBreached: z.boolean().default(false),
  totalDocuments: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  confidence: z.number().nullable(),
  assignedTo: z.string().nullable().optional(),
  stpEligible: z.boolean().default(false),
  stpExecuted: z.boolean().default(false),
  riskScore: z.number().min(0).max(100).default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TransactionSummary = z.infer<typeof TransactionSummarySchema>;

export const TransactionDetailSchema = TransactionSummarySchema.extend({
  documents: z.array(PacketDocumentSchema),
  crossDocFindings: z.array(CrossDocFindingSchema),
  auditLog: z.array(AuditEntrySchema),
  extractedMetadata: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().optional(),
});
export type TransactionDetail = z.infer<typeof TransactionDetailSchema>;

export const CreateTransactionPacketSchema = z.object({
  tenantId: z.string().default("tenant-default"),
  title: z.string().min(1),
  channel: TransactionChannelSchema.default("portal"),
  priority: TransactionPrioritySchema.default("normal"),
  documents: z.array(
    z.object({
      documentId: z.string(),
      name: z.string(),
      docType: z.string().optional(),
      pageCount: z.number().optional(),
      fileBytes: z.number().optional(),
      isAttachment: z.boolean().optional(),
    })
  ).min(1),
  notes: z.string().optional(),
});
export type CreateTransactionPacketInput = z.infer<typeof CreateTransactionPacketSchema>;

export const ControlTowerStatsSchema = z.object({
  tenantId: z.string(),
  timeRange: z.string(),
  totalPackets: z.number(),
  processedPackets: z.number(),
  inReviewPackets: z.number(),
  failedPackets: z.number(),
  stpRatePercent: z.number(),
  slaCompliancePercent: z.number(),
  avgTurnaroundMinutes: z.number(),
  activeReviewersCount: z.number(),
  channelBreakdown: z.record(z.string(), z.number()),
  hourlyThroughput: z.array(
    z.object({
      hour: z.string(),
      ingested: z.number(),
      processed: z.number(),
      stp: z.number(),
    })
  ),
  accuracyMean: z.number(),
  estimatedCostSavingsUsd: z.number(),
});
export type ControlTowerStats = z.infer<typeof ControlTowerStatsSchema>;
