import { createContext, useContext, useMemo, useCallback, useState, useEffect, useRef, type ReactNode } from "react";
import { fetchDocuments, usePolled, UNAUTHORIZED_EVENT } from "@/senderra/api";
import { hilQueue } from "@/data/mockData";

export interface QueueCountState {
  hilCount: number;
  notificationCount: number;
  isLive: boolean;
  refreshCounts: () => Promise<void>;
  setPollingEnabled: (enabled: boolean) => void;
}

const QueueCountContext = createContext<QueueCountState>({
  hilCount: 0,
  notificationCount: 0,
  isLive: false,
  refreshCounts: async () => {},
  setPollingEnabled: () => {},
});

export function QueueCountProvider({ children }: { children: ReactNode }) {
  const [pollingEnabled, setPollingEnabledState] = useState(false);
  const pollingEnabledRef = useRef(false);

  const livePoller = usePolled(
    () => (pollingEnabledRef.current ? fetchDocuments({ needsReview: "true" }) : Promise.resolve(null)),
    6000
  );
  const refreshRef = useRef(livePoller.refresh);
  refreshRef.current = livePoller.refresh;

  const setPollingEnabled = useCallback((enabled: boolean) => {
    const wasEnabled = pollingEnabledRef.current;
    pollingEnabledRef.current = enabled;
    setPollingEnabledState(enabled);
    if (enabled && !wasEnabled) {
      void refreshRef.current();
    }
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      pollingEnabledRef.current = false;
      setPollingEnabledState(false);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const liveList = pollingEnabled ? (livePoller.data?.documents ?? []) : [];
  const isLive = pollingEnabled && Boolean(livePoller.data);

  // Real-time count of items awaiting review
  const hilCount = useMemo(() => {
    if (isLive) {
      return liveList.length;
    }
    // Fallback to local mock items needing review only before first remote response
    return hilQueue.filter((d) => d.status === "Needs Review").length;
  }, [isLive, liveList]);

  // Notifications represent documents requiring human attention
  const notificationCount = hilCount;

  const refreshCounts = useCallback(async () => {
    if (pollingEnabled) await livePoller.refresh();
  }, [livePoller, pollingEnabled]);

  return (
    <QueueCountContext.Provider value={{ hilCount, notificationCount, isLive, refreshCounts, setPollingEnabled }}>
      {children}
    </QueueCountContext.Provider>
  );
}

export function useQueueCount() {
  return useContext(QueueCountContext);
}
