import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Which solution the Client 1 workspace is currently operating.
 *
 * `invoice` is the original fixture-driven demo, kept intact. `priorauth` is
 * the live one — every screen under it reads the Senderra IDP pipeline's real
 * Cosmos projection. Keeping both behind one switch is what lets the shell,
 * navigation and RBAC stay exactly as they were while the operational surfaces
 * swap underneath.
 */
export type SolutionKey = "invoice" | "priorauth";

export type SolutionDefinition = {
  key: SolutionKey;
  name: string;
  summary: string;
  live: boolean;
  documentTypes: string;
  pipeline: string;
};

export const SOLUTIONS: Record<SolutionKey, SolutionDefinition> = {
  invoice: {
    key: "invoice",
    name: "Invoice Processing",
    summary:
      "Accounts-payable invoice capture with a nine-field metadata contract. Demo fixtures — no pipeline attached.",
    live: false,
    documentTypes: "Invoice",
    pipeline: "Fixture data",
  },
  priorauth: {
    key: "priorauth",
    name: "Prior Auth Processing",
    summary:
      "Specialty-pharmacy prior authorisation. Live Senderra IDP pipeline — Content Understanding OCR, classification and field extraction with grounded evidence.",
    live: true,
    documentTypes:
      "Prescription · Prior-auth response · Approval / denial letter · Clinical notes · Patient demographics · Insurance card",
    pipeline: "Azure Blob → Event Grid → Service Bus → Content Understanding → GPT extract → Cosmos DB",
  },
};

const STORAGE_KEY = "pacca.activeSolution";

type SolutionState = {
  solution: SolutionDefinition;
  solutionKey: SolutionKey;
  setSolution: (key: SolutionKey) => void;
  isLive: boolean;
};

const SolutionCtx = createContext<SolutionState | null>(null);

export function SolutionProvider({ children }: { children: React.ReactNode }) {
  const [solutionKey, setKey] = useState<SolutionKey>(() => {
    // A private window or a browser blocking site data throws on read, so the
    // default has to survive the accessor itself failing, not just a miss.
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "invoice" || stored === "priorauth") return stored;
    } catch {
      /* fall through to the default */
    }
    return "priorauth";
  });

  const setSolution = useCallback((key: SolutionKey) => {
    setKey(key);
    try {
      window.localStorage.setItem(STORAGE_KEY, key);
    } catch {
      /* the choice still applies for this session */
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.solution = solutionKey;
  }, [solutionKey]);

  const value = useMemo<SolutionState>(
    () => ({
      solutionKey,
      solution: SOLUTIONS[solutionKey],
      setSolution,
      isLive: SOLUTIONS[solutionKey].live,
    }),
    [solutionKey, setSolution]
  );

  return <SolutionCtx.Provider value={value}>{children}</SolutionCtx.Provider>;
}

export function useSolution(): SolutionState {
  const ctx = useContext(SolutionCtx);
  if (!ctx) throw new Error("useSolution must be used inside a SolutionProvider.");
  return ctx;
}
