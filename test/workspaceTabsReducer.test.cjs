const assert = require("node:assert/strict");
const test = require("node:test");
const { workspaceTabsReducer } = require("../webview/src/tabs/workspaceTabsReducer.ts");

function tab(id, pinned = false) {
  return { id, title: id, kind: "graph", focusEntityId: id, pinned };
}

test("opening a preview replaces the previous preview and preserves pinned tabs", () => {
  const state = { tabs: [tab("pinned", true), tab("preview")], activeTabId: "preview" };
  const next = workspaceTabsReducer(state, { type: "open", tab: tab("next"), pinned: false });

  assert.deepEqual(next.tabs.map((entry) => entry.id), ["pinned", "next"]);
  assert.equal(next.activeTabId, "next");
});

test("opening an existing preview as pinned updates it in place", () => {
  const state = { tabs: [tab("preview")], activeTabId: "preview" };
  const next = workspaceTabsReducer(state, { type: "open", tab: tab("preview"), pinned: true });

  assert.equal(next.tabs.length, 1);
  assert.equal(next.tabs[0].pinned, true);
});

test("closing the active tab activates the first remaining tab", () => {
  const state = { tabs: [tab("first", true), tab("active", true)], activeTabId: "active" };
  const next = workspaceTabsReducer(state, { type: "close", tabId: "active" });

  assert.equal(next.activeTabId, "first");
});
