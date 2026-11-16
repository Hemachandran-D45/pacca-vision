import { describe, expect, it } from "vitest";
import { reconcileSelection } from "../../client/src/pages/hil-review/selection";

const queueIds = ["doc-a", "doc-b", "doc-c"];

describe("HIL review selection", () => {
  it("keeps a document the reviewer picked after opening HIL from another document", () => {
    // Opened via openHil("doc-a"), then chose doc-b in the dropdown.
    expect(
      reconcileSelection({ selectedId: "doc-b", focusDocumentId: "doc-a", queueIds, isLiveConnected: true })
    ).toBe("doc-b");
  });

  it("keeps the document opened directly even when it is not in the queue", () => {
    expect(
      reconcileSelection({
        selectedId: "routed-to-ivr",
        focusDocumentId: "routed-to-ivr",
        queueIds,
        isLiveConnected: true,
      })
    ).toBe("routed-to-ivr");
  });

  it("falls back to the top of the queue when nothing is selected", () => {
    expect(
      reconcileSelection({ selectedId: null, focusDocumentId: null, queueIds, isLiveConnected: true })
    ).toBe("doc-a");
  });

  it("moves off a document that has left the queue", () => {
    expect(
      reconcileSelection({ selectedId: "approved", focusDocumentId: null, queueIds, isLiveConnected: true })
    ).toBe("doc-a");
  });

  it("selects nothing when the queue is empty", () => {
    expect(
      reconcileSelection({ selectedId: null, focusDocumentId: null, queueIds: [], isLiveConnected: true })
    ).toBeNull();
  });

  it("leaves the selection alone until the queue has loaded", () => {
    expect(
      reconcileSelection({ selectedId: "doc-b", focusDocumentId: null, queueIds: [], isLiveConnected: false })
    ).toBe("doc-b");
  });
});
