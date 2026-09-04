import { createContext, useContext, useMemo, useCallback, type ReactNode } from "react";
import { fetchDocuments, usePolled } from "@/senderra/api";
import { hilQueue } from "@/data/mockData";

export interface QueueCountState {
  hilCount: number;
  notificationCount: number;
  isLive: boolean;
  refreshCounts: () => Promise<void>;
}

const QueueCountContext = createContext<QueueCountState>({
  hilCount: 0,
  notificationCount: 0,
  isLive: false,
  refreshCounts: async () => {},
});

export function QueueCountProvider({ children }: { children: ReactNode }) {
  // Poll live documents awaiting review every 6 seconds
  const livePoller = usePolled(() => fetchDocuments({ needsReview: "true" }), 6000);
  const liveList = livePoller.data?.documents ?? [];
  const isLive = liveList.length > 0;

  // Real-time count of items awaiting review
  const hilCount = useMemo(() => {
    if (isLive) {
      return liveList.length;
    }
    // Fallback to local mock items needing review
    return hilQueue.filter((d) => d.status === "Needs Review").length;
  }, [isLive, liveList]);

  // Notifications represent documents requiring human attention
  const notificationCount = hilCount;

  const refreshCounts = useCallback(async () => {
    await livePoller.refresh();
  }, [livePoller]);

  return (
    <QueueCountContext.Provider value={{ hilCount, notificationCount, isLive, refreshCounts }}>
      {children}
    </QueueCountContext.Provider>
  );
}

export function useQueueCount() {
  return useContext(QueueCountContext);
}
