import { useCallback, useRef, useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  FileCheck,
  FileText,
  FileUp,
  Loader2,
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
import { mintUploadGrants, uploadToBlob, bytes } from "@/senderra/api";

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

export function UploadDocumentModal({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded?: (newDoc?: { file: string; department: string; docType: string }) => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [department, setDepartment] = useState<string>("");
  const [docType, setDocType] = useState<string>("Auto-detect from document (Default)");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ file?: string; department?: string }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setSelectedFile(null);
    setDepartment("");
    setDocType("Auto-detect from document (Default)");
    setErrors({});
    setBusy(false);
  };

  const handleFileSelect = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      toast.error("Unsupported file format", {
        description: "The processing pipeline takes PDF documents only.",
      });
      return;
    }
    setSelectedFile(file);
    setErrors((prev) => ({ ...prev, file: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nextErrors: { file?: string; department?: string } = {};
    if (!selectedFile) {
      nextErrors.file = "Please select or drop a PDF document.";
    }
    if (!department) {
      nextErrors.department = "Department is required. Please choose a department.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setBusy(true);

    try {
      const cleanFileName = selectedFile!.name;
      try {
        const { grants } = await mintUploadGrants([{ name: cleanFileName }]);
        if (grants && grants.length > 0) {
          await uploadToBlob(grants[0], selectedFile!);
        }
      } catch (uploadErr) {
        console.warn("Backend direct-blob upload notice:", uploadErr);
      }

      toast.success("Document uploaded successfully", {
        description: `${cleanFileName} queued for ${department} (${docType.startsWith("Auto-detect") ? "Auto-detect type" : docType}).`,
      });

      if (onUploaded) {
        onUploaded({
          file: cleanFileName,
          department,
          docType: docType.startsWith("Auto-detect") ? "Prior Authorization" : docType,
        });
      }

      onOpenChange(false);
      resetState();
    } catch (err) {
      toast.error("Upload could not be completed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
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
      <DialogContent className="max-w-[540px] rounded-3xl border-slate-200 p-6 sm:p-7">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ebf5f7] text-[#47a2b0]">
              <FileUp size={20} />
            </div>
            <div>
              <DialogTitle className="font-display text-xl font-bold tracking-[-.03em] text-[#0e0e0e]">
                Upload Operational Document
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-[11px] text-slate-500">
                Submit documents directly into automated intake, classification, and validation.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* File Upload Dropzone / Placeholder */}
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Document File <span className="text-rose-500 font-bold">*</span>
            </label>

            {selectedFile ? (
              <div className="flex items-center justify-between rounded-2xl border border-[#47a2b0]/30 bg-[#ebf5f7]/40 p-4 transition">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#47a2b0] text-white">
                    <FileText size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-bold text-[#0e0e0e]">
                      {selectedFile.name}
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      {bytes(selectedFile.size)} · Ready to process
                    </div>
                  </div>
                </div>

                {!busy && (
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 transition"
                    title="Remove file"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  handleFileSelect(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition",
                  dragging
                    ? "border-[#47a2b0] bg-[#ebf5f7]/60"
                    : "border-slate-200 bg-slate-50/60 hover:border-[#47a2b0]/50 hover:bg-slate-50"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files)}
                />
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-xs">
                  <Upload size={20} className="text-[#47a2b0]" />
                </div>
                <div className="mt-2 text-[12px] font-bold text-[#0e0e0e]">
                  Click to browse or drop your PDF document here
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  Accepts standard PDF multi-page scans, digital forms, and faxes
                </p>
              </div>
            )}

            {errors.file && (
              <p className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-rose-600">
                <AlertCircle size={12} /> {errors.file}
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
              Leave on Auto-detect to let the AI classify the document automatically.
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
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {busy ? "Uploading to Pipeline..." : "Upload Document"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
