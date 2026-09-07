import { useCallback, useRef, useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  FileCheck,
  FileText,
  FileUp,
  Files,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { mintUploadGrants, uploadToBlob, bytes, type UploadGrant } from "@/senderra/api";

export const UPLOAD_DEPARTMENTS = [
  "Prior Authorization",
  "Billing & Claims",
  "Clinical Operations",
  "Pharmacy Operations",
  "Appeals & Compliance",
  "Patient Intake",
] as const;

export const UPLOAD_DOC_TYPES = [
  "Auto-detect from document (Default)",
  "Prior Authorization Request",
  "Medical Invoice",
  "CMS-1500 Claim Form",
  "UB-04 Institutional Claim",
  "Clinical Encounter Note",
  "Specialty Prescription",
  "Appeal Checklist",
  "Letter of Medical Necessity",
  "Patient Demographics / Intake",
] as const;

export const DEPARTMENT_DEFAULT_DOC_TYPE: Record<string, string> = {
  "Prior Authorization": "Prior Authorization Request",
  "Billing & Claims": "CMS-1500 Claim Form",
  "Clinical Operations": "Clinical Note",
  "Pharmacy Operations": "Specialty Prescription",
  "Appeals & Compliance": "Appeal Checklist",
  "Patient Intake": "Referral Form",
};

export function resolveUploadDocType(docTypeInput: string, departmentInput: string, fileName?: string): string {
  if (docTypeInput && !docTypeInput.startsWith("Auto-detect")) {
    return docTypeInput;
  }
  if (fileName) {
    const fn = fileName.toLowerCase();
    if (fn.includes("prescription") || fn.includes("rx")) return "Specialty Prescription";
    if (fn.includes("clinical") || fn.includes("note")) return "Clinical Note";
    if (fn.includes("referral")) return "Referral Form";
    if (fn.includes("eob") || fn.includes("explanation")) return "Explanation of Benefits";
    if (fn.includes("invoice") || fn.includes("bill") || fn.includes("claim")) return "CMS-1500 Claim Form";
    if (fn.includes("appeal")) return "Appeal Checklist";
    if (fn.includes("prior_auth") || fn.includes("pa_") || fn.includes("determination")) return "Prior Authorization";
  }
  return DEPARTMENT_DEFAULT_DOC_TYPE[departmentInput] || "Specialty Prescription";
}

export type UploadedDocInfo = {
  file: string;
  department: string;
  docType: string;
  documentId: string;
  blobName: string;
};

export function UploadDocumentModal({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded?: (newDocs: UploadedDocInfo[] | UploadedDocInfo) => void;
}) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [department, setDepartment] = useState<string>("");
  const [docType, setDocType] = useState<string>("Auto-detect from document (Default)");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [errors, setErrors] = useState<{ files?: string; department?: string }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setSelectedFiles([]);
    setDepartment("");
    setDocType("Auto-detect from document (Default)");
    setErrors({});
    setBusy(false);
    setUploadProgress(null);
  };

  const handleAddFiles = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;

    const incoming = Array.from(files);
    const validPdfs: File[] = [];
    let invalidCount = 0;

    incoming.forEach((file) => {
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        validPdfs.push(file);
      } else {
        invalidCount++;
      }
    });

    if (invalidCount > 0) {
      toast.error(`${invalidCount} non-PDF file${invalidCount > 1 ? "s" : ""} skipped`, {
        description: "The processing pipeline takes PDF documents only.",
      });
    }

    if (validPdfs.length === 0) return;

    setSelectedFiles((prev) => {
      const existingKeys = new Set(prev.map((f) => `${f.name}_${f.size}`));
      const newItems = validPdfs.filter((f) => !existingKeys.has(`${f.name}_${f.size}`));
      return [...prev, ...newItems];
    });

    setErrors((prev) => ({ ...prev, files: undefined }));
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nextErrors: { files?: string; department?: string } = {};
    if (selectedFiles.length === 0) {
      nextErrors.files = "Please select or drop at least one PDF document.";
    }
    if (!department) {
      nextErrors.department = "Department is required. Please choose a department.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setBusy(true);
    setUploadProgress({ current: 1, total: selectedFiles.length });

    const uploadedList: UploadedDocInfo[] = [];

    try {
      const res = await mintUploadGrants(selectedFiles.map((f) => ({ name: f.name })));
      const grantsList: UploadGrant[] = res?.grants ?? [];
      if (grantsList.length !== selectedFiles.length) {
        throw new Error("Upload grant count did not match the selected files.");
      }

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setUploadProgress({ current: i + 1, total: selectedFiles.length });

        const grant = grantsList[i];
        if (!grant?.documentId) {
          throw new Error(`No upload grant for ${file.name}.`);
        }
        await uploadToBlob(grant, file);

        const resolvedType = resolveUploadDocType(docType, department, file.name);
        uploadedList.push({
          file: file.name,
          department,
          docType: resolvedType,
          documentId: grant.documentId,
          blobName: grant.blobName,
        });
      }

      const isBulk = selectedFiles.length > 1;
      const firstType = resolveUploadDocType(docType, department, selectedFiles[0]?.name);
      toast.success(
        isBulk
          ? `Bulk upload complete: ${selectedFiles.length} documents uploaded`
          : "Document uploaded successfully",
        {
          description: `${
            isBulk ? `${selectedFiles.length} files` : selectedFiles[0].name
          } routed to ${department} (${firstType}).`,
        }
      );

      if (onUploaded) {
        onUploaded(uploadedList);
      }

      onOpenChange(false);
      resetState();
    } catch (err) {
      toast.error("Upload could not be completed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (busy) return;
        onOpenChange(isOpen);
        if (!isOpen) resetState();
      }}
    >
      <DialogContent className="max-w-[580px] rounded-3xl border-slate-200 p-6 sm:p-7">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ebf5f7] text-[#47a2b0]">
              <FileUp size={20} />
            </div>
            <div>
              <DialogTitle className="font-display text-xl font-bold tracking-[-.03em] text-[#0e0e0e]">
                Upload Operational Documents
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-[11px] text-slate-500">
                Submit single or bulk documents into automated intake, classification, and validation.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* File Upload Dropzone / Multi-File Manager */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Document Files <span className="text-rose-500 font-bold">*</span>
              </label>
              {selectedFiles.length > 0 && (
                <span className="text-[10px] font-semibold text-slate-500">
                  {selectedFiles.length} {selectedFiles.length === 1 ? "file" : "files"} ({bytes(totalSize)})
                </span>
              )}
            </div>

            {/* Hidden native input with multiple support */}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                handleAddFiles(e.target.files);
                e.target.value = "";
              }}
            />

            {selectedFiles.length === 0 ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  handleAddFiles(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition",
                  dragging
                    ? "border-[#47a2b0] bg-[#ebf5f7]/60"
                    : "border-slate-200 bg-slate-50/60 hover:border-[#47a2b0]/50 hover:bg-slate-50"
                )}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-xs text-[#47a2b0]">
                  <Upload size={20} />
                </div>
                <div className="mt-2 text-[12px] font-bold text-[#0e0e0e]">
                  Click to browse or drop PDF documents here
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  Supports single files or <strong>bulk upload</strong> of multiple PDFs
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-[9px] font-bold text-slate-500 shadow-xs border border-slate-200/60">
                  <Files size={12} className="text-[#47a2b0]" /> Bulk PDF Multi-Select Enabled
                </div>
              </div>
            ) : (
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/50 p-3">
                {/* Header bar of selected files */}
                <div className="flex items-center justify-between px-1 pb-1 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#47a2b0]/15 px-2 py-0.5 text-[10px] font-bold text-[#2d7d8a]">
                      <Files size={12} />
                      {selectedFiles.length} {selectedFiles.length === 1 ? "Document" : "Documents (Bulk)"}
                    </span>
                  </div>
                  {!busy && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-[#47a2b0] hover:text-[#37828e] transition"
                      >
                        <Plus size={12} /> Add more
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedFiles([])}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-500 hover:text-rose-700 transition"
                      >
                        <Trash2 size={11} /> Clear all
                      </button>
                    </div>
                  )}
                </div>

                {/* Scrollable list of files */}
                <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                  {selectedFiles.map((file, idx) => (
                    <div
                      key={`${file.name}_${idx}`}
                      className="flex items-center justify-between rounded-xl border border-slate-200/90 bg-white p-2.5 shadow-xs transition"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#ebf5f7] text-[#47a2b0]">
                          <FileText size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-bold text-[#0e0e0e]" title={file.name}>
                            {file.name}
                          </div>
                          <div className="text-[9px] text-slate-400">
                            {bytes(file.size)} · PDF
                          </div>
                        </div>
                      </div>

                      {!busy && (
                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-500 transition"
                          title="Remove file"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {errors.files && (
              <p className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-rose-600">
                <AlertCircle size={12} /> {errors.files}
              </p>
            )}
          </div>

          {/* Department (Required) */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Department <span className="text-rose-500 font-bold">*</span>
              </label>
              <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[8px] font-bold text-rose-600">
                Required
              </span>
            </div>
            <div className="relative">
              <select
                value={department}
                onChange={(e) => {
                  setDepartment(e.target.value);
                  if (errors.department) {
                    setErrors((prev) => ({ ...prev, department: undefined }));
                  }
                }}
                className={cn(
                  "h-11 w-full rounded-xl border bg-white px-3 text-[11px] font-semibold text-slate-700 outline-none transition focus:border-[#47a2b0] focus:ring-1 focus:ring-[#47a2b0]",
                  errors.department ? "border-rose-300 bg-rose-50/30" : "border-slate-200"
                )}
              >
                <option value="">Select a department...</option>
                {UPLOAD_DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
            {errors.department && (
              <p className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-rose-600">
                <AlertCircle size={12} /> {errors.department}
              </p>
            )}
          </div>

          {/* Document Type (Optional) */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Document Type
              </label>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold text-slate-500">
                Optional
              </span>
            </div>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 outline-none transition focus:border-[#47a2b0] focus:ring-1 focus:ring-[#47a2b0]"
            >
              {UPLOAD_DOC_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[9px] text-slate-400">
              Leave on Auto-detect to let the AI classify {selectedFiles.length > 1 ? "each document" : "the document"} automatically.
            </p>
          </div>

          <DialogFooter className="mt-6 flex flex-row items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onOpenChange(false);
                resetState();
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#47a2b0] px-5 py-2.5 text-[11px] font-bold text-white shadow-[0_8px_18px_rgba(71,162,176,.18)] hover:bg-[#37828e] transition active:scale-[.98] disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>
                    {uploadProgress
                      ? `Uploading ${uploadProgress.current} of ${uploadProgress.total}...`
                      : "Uploading..."}
                  </span>
                </>
              ) : (
                <>
                  <Upload size={15} />
                  <span>
                    {selectedFiles.length > 1
                      ? `Upload ${selectedFiles.length} Documents`
                      : "Upload Document"}
                  </span>
                </>
              )}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
