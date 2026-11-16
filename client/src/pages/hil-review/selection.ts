/**
 * Which document the HIL workbench should show once the live queue updates.
 *
 * The reviewer's own choice wins as long as it is still reviewable: either in
 * the queue, or the document HIL was opened on (which may sit outside the
 * queue, e.g. one routed to IVR). Otherwise fall back to the top of the queue.
 *
 * `focusDocumentId` only protects that document from being auto-replaced. It
 * must never override a different selection: it stays set for as long as the
 * page is mounted, so forcing it here pinned the dropdown to that document and
 * reverted every change the reviewer made.
 */
export function reconcileSelection({
  selectedId,
  focusDocumentId,
  queueIds,
  isLiveConnected,
}: {
  selectedId: string | null;
  focusDocumentId: string | null | undefined;
  queueIds: string[];
  isLiveConnected: boolean;
}): string | null {
  if (!isLiveConnected) return selectedId;
  if (selectedId && (selectedId === focusDocumentId || queueIds.includes(selectedId))) {
    return selectedId;
  }
  return queueIds[0] ?? null;
}
