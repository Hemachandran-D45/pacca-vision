import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, FileText, Info, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export function MockDocViewer({
  highlightedField,
  onSelectField,
}: {
  highlightedField?: string | null;
  onSelectField?: (field: string) => void;
}) {
  const [activePage, setActivePage] = useState<1 | 2>(1);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-inner select-none">
      {/* Viewer Header / Toolbar */}
      <div className="shrink-0 flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2 text-xs">
        <div className="flex items-center gap-2 font-medium text-slate-700">
          <FileText size={15} className="text-[#47a2b0]" />
          <span className="font-semibold text-slate-900">PA-88421_Dupixent_ClinicalExceptions.pdf</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
            Intake Scan
          </span>
        </div>

        {/* Page Nav & Legend */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-3 text-[10px] font-semibold text-slate-500">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> STP Passed
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> OCR Warning
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-rose-500" /> Ungrounded
            </span>
          </div>

          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              onClick={() => setActivePage(1)}
              disabled={activePage === 1}
              className="rounded p-1 text-slate-500 hover:bg-white disabled:opacity-30 transition"
              title="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2 text-[10px] font-bold text-slate-700">Page {activePage} of 2</span>
            <button
              onClick={() => setActivePage(2)}
              disabled={activePage === 2}
              className="rounded p-1 text-slate-500 hover:bg-white disabled:opacity-30 transition"
              title="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Scanned Document Canvas */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex justify-center bg-slate-200/60">
        <div className="w-full max-w-[720px] rounded-lg bg-white p-6 sm:p-8 shadow-md border border-slate-300/80 font-sans text-slate-800 relative">
          {/* Subtle scanned document paper stamp / watermark */}
          <div className="absolute top-4 right-4 rotate-6 rounded border border-rose-400 bg-rose-50/70 px-2 py-0.5 text-[9px] font-mono font-bold text-rose-700 uppercase tracking-widest pointer-events-none">
            FAX RECEIVED · 09:14 AM
          </div>

          {activePage === 1 ? (
            /* Page 1: Patient & Clinical Info */
            <div className="space-y-5">
              {/* Header */}
              <div className="border-b-2 border-slate-800 pb-3">
                <div className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">
                  CONFIDENTIAL MEDICAL COMMUNICATION · SENDERRA SPECIALTY RX
                </div>
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 mt-0.5">
                  PRIOR AUTHORIZATION &amp; ENROLLMENT INTAKE FORM
                </h1>
                <p className="text-[11px] text-slate-500">
                  Please complete all sections clearly to expedite insurance benefit verification.
                </p>
              </div>

              {/* Section 1: Patient Demographics */}
              <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3.5 space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1">
                  1. Patient Demographics
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Patient Name: Verified */}
                  <div
                    onClick={() => onSelectField?.("patient_name")}
                    className={cn(
                      "cursor-pointer rounded border p-2 transition",
                      highlightedField === "patient_name"
                        ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-300"
                        : "border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50"
                    )}
                  >
                    <div className="text-[9px] font-bold text-emerald-800 uppercase flex items-center justify-between">
                      <span>Patient Full Name</span>
                      <span className="flex items-center gap-0.5 text-[8px] text-emerald-700 font-bold">
                        <CheckCircle2 size={9} /> 99% STP Verified
                      </span>
                    </div>
                    <div className="mt-1 font-semibold text-slate-900 font-mono text-xs">
                      Johnathan R. Davis
                    </div>
                  </div>

                  {/* Patient DOB: Low OCR Confidence */}
                  <div
                    onClick={() => onSelectField?.("patient_dob")}
                    className={cn(
                      "cursor-pointer rounded border-2 border-dashed p-2 transition",
                      highlightedField === "patient_dob"
                        ? "border-amber-600 bg-amber-100 ring-2 ring-amber-400"
                        : "border-amber-400 bg-amber-50/60 hover:bg-amber-100/60"
                    )}
                  >
                    <div className="text-[9px] font-bold text-amber-900 uppercase flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <AlertTriangle size={10} className="text-amber-700" /> Date of Birth
                      </span>
                      <span className="rounded bg-amber-200/80 px-1 py-0.2 text-[8px] font-bold text-amber-900">
                        Scan Clarity 54% (Faint)
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-xs font-bold text-slate-800 tracking-wider">
                      04/12/1984
                    </div>
                    <div className="mt-1 text-[8px] text-amber-800 font-medium">
                      Thermal print degradation detected on scan
                    </div>
                  </div>

                  {/* Member ID: Low Model Certainty */}
                  <div
                    onClick={() => onSelectField?.("member_id")}
                    className={cn(
                      "cursor-pointer rounded border p-2 transition",
                      highlightedField === "member_id"
                        ? "border-amber-600 bg-amber-100 ring-2 ring-amber-400"
                        : "border-amber-300 bg-amber-50/40 hover:bg-amber-100/40"
                    )}
                  >
                    <div className="text-[9px] font-bold text-amber-900 uppercase flex items-center justify-between">
                      <span>Primary Insurance Member ID</span>
                      <span className="rounded bg-amber-200/80 px-1 py-0.2 text-[8px] font-bold text-amber-900">
                        Certainty 68% (&lt;80% Floor)
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-xs font-semibold text-slate-900">
                      W98340127
                    </div>
                  </div>

                  {/* Patient Phone: IVR Outreach */}
                  <div
                    onClick={() => onSelectField?.("patient_phone")}
                    className={cn(
                      "cursor-pointer rounded border p-2 transition",
                      highlightedField === "patient_phone"
                        ? "border-indigo-600 bg-indigo-50 ring-2 ring-indigo-300"
                        : "border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50"
                    )}
                  >
                    <div className="text-[9px] font-bold text-indigo-900 uppercase flex items-center justify-between">
                      <span>Callback Phone Number</span>
                      <span className="rounded bg-indigo-100 px-1 py-0.2 text-[8px] font-bold text-indigo-800">
                        📞 Verified via IVR
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-xs font-semibold text-slate-900">
                      (555) 382-9104
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Clinical Details */}
              <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3.5 space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1">
                  2. Diagnosis &amp; Prescribed Medication
                </div>

                <div className="space-y-2.5 text-xs">
                  {/* Diagnosis */}
                  <div
                    onClick={() => onSelectField?.("diagnosis")}
                    className="cursor-pointer rounded border border-emerald-300 bg-emerald-50/40 p-2 hover:bg-emerald-50 transition"
                  >
                    <div className="text-[9px] font-bold text-emerald-800 uppercase flex items-center justify-between">
                      <span>Primary Diagnosis Code &amp; Description</span>
                      <span className="text-[8px] text-emerald-700 font-bold">✓ 96% Match</span>
                    </div>
                    <div className="mt-1 font-semibold text-slate-900 font-mono text-xs">
                      L20.9 Atopic Dermatitis, severe refractory
                    </div>
                  </div>

                  {/* Medication */}
                  <div
                    onClick={() => onSelectField?.("medication")}
                    className="cursor-pointer rounded border border-emerald-300 bg-emerald-50/40 p-2 hover:bg-emerald-50 transition"
                  >
                    <div className="text-[9px] font-bold text-emerald-800 uppercase flex items-center justify-between">
                      <span>Requested Specialty Medication</span>
                      <span className="text-[8px] text-emerald-700 font-bold">✓ 98% Match</span>
                    </div>
                    <div className="mt-1 font-semibold text-slate-900 font-mono text-xs">
                      Dupixent 300mg/2mL Pre-filled Syringe
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-600">
                      Sig: 600mg subcutaneous initial dose, then 300mg every 2 weeks subcutaneously.
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setActivePage(2)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
                >
                  View Page 2 (Prescriber Details &amp; NPI Exception) <ChevronRight size={13} />
                </button>
              </div>
            </div>
          ) : (
            /* Page 2: Prescriber & Ungrounded NPI */
            <div className="space-y-5">
              <div className="border-b-2 border-slate-800 pb-3 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">
                    PAGE 2 OF 2 · CLINICAL AUTHENTICATION
                  </div>
                  <h2 className="text-base font-bold tracking-tight text-slate-900">
                    PRESCRIBER ATTESTATION &amp; CLINIC DETAILS
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setActivePage(1)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#47a2b0] hover:underline"
                >
                  <ChevronLeft size={13} /> Back to Page 1
                </button>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3.5 space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1">
                  3. Prescriber Information
                </div>

                <div className="space-y-3 text-xs">
                  {/* Prescriber Name */}
                  <div
                    onClick={() => onSelectField?.("prescriber_name")}
                    className="cursor-pointer rounded border border-emerald-300 bg-emerald-50/40 p-2 hover:bg-emerald-50 transition"
                  >
                    <div className="text-[9px] font-bold text-emerald-800 uppercase flex items-center justify-between">
                      <span>Attending Physician</span>
                      <span className="text-[8px] text-emerald-700 font-bold">✓ 97% STP Verified</span>
                    </div>
                    <div className="mt-1 font-semibold text-slate-900 font-mono text-xs">
                      Dr. Sarah Jenkins, MD
                    </div>
                    <div className="text-[10px] text-slate-500">Metro Dermatology &amp; Allergy Institute</div>
                  </div>

                  {/* Prescriber NPI: UNGROUNDED / HALLUCINATION GATE */}
                  <div
                    onClick={() => onSelectField?.("prescriber_npi")}
                    className={cn(
                      "cursor-pointer rounded border-2 border-dashed p-3 transition",
                      highlightedField === "prescriber_npi"
                        ? "border-rose-600 bg-rose-100 ring-2 ring-rose-400"
                        : "border-rose-400 bg-rose-50/70 hover:bg-rose-100/70"
                    )}
                  >
                    <div className="text-[9px] font-bold text-rose-900 uppercase flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <ShieldAlert size={12} className="text-rose-600" /> Prescriber NPI (National Provider Identifier)
                      </span>
                      <span className="rounded bg-rose-200 px-1.5 py-0.5 text-[8px] font-bold text-rose-900">
                        Ungrounded · Hallucination Gate
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-3">
                      <div className="rounded bg-slate-200/80 px-2 py-1 font-mono text-xs text-slate-500 line-through">
                        [ ~~~~~ illegible / unquoted ~~~~~ ]
                      </div>
                      <div className="text-[10px] font-mono text-rose-700">
                        Model candidate: <strong>1942850193</strong> (Grounding score: 32%)
                      </div>
                    </div>

                    <div className="mt-2 rounded bg-white/90 p-2 text-[10px] text-rose-800 leading-relaxed border border-rose-200">
                      <strong>Automated Validation Gate Alert:</strong> The model inferred NPI <code>1942850193</code> from historical registry lookup, but this exact 10-digit number is NOT printed verbatim on this document page. Routed to Human-in-the-Loop review to prevent synthetic data entry.
                    </div>
                  </div>
                </div>
              </div>

              {/* Attestation & Signature Box */}
              <div className="rounded-md border border-slate-200 p-3 bg-white space-y-2">
                <div className="text-[10px] font-semibold text-slate-500">
                  Prescriber Attestation: I certify that the requested medication is medically necessary for this patient.
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                  <span className="font-mono text-slate-600 italic">Signature: /s/ Sarah Jenkins, MD</span>
                  <span className="text-[10px] font-mono text-slate-400">Date: 2026-09-14</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
