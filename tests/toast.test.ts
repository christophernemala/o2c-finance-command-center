import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { act, createElement } from "react";

test("a toast that returns as a new occurrence shows again after an earlier dismissal", async () => {
  const win = new Window({ url: "http://localhost/?view=notes&message=Saved&nonce=n1" });
  const globals = { window: win, self: win, document: win.document, navigator: win.navigator, HTMLElement: win.HTMLElement, Element: win.Element, IS_REACT_ACT_ENVIRONMENT: true };
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries(globals)) { saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { value, writable: true, configurable: true }); }
  const { createRoot } = await import("react-dom/client");
  const { Toast } = await import("../src/components/ui/overlay");
  const container = win.document.createElement("div"); win.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const shown = () => container.querySelector(".ds-toast span")?.textContent ?? null;
  const show = async (message: string, id: string) => { await act(async () => { root.render(createElement(Toast, { message, id })); }); };
  try {
    await show("Saved", "n1");
    assert.equal(shown(), "Saved");
    assert.equal(win.location.search, "?view=notes", "the result flags are cleared so a refresh doesn't repeat it");
    await act(async () => { container.querySelector('button[aria-label="Dismiss"]')?.dispatchEvent(new win.MouseEvent("click", { bubbles: true })); });
    assert.equal(shown(), null);
    await show("Rejected", "n2");
    assert.equal(shown(), "Rejected");
    await show("Saved", "n3");
    assert.equal(shown(), "Saved", "A → B → A: the second Saved is a new occurrence");
    await show("Saved", "n3");
    assert.equal(shown(), "Saved", "a re-render of the same occurrence stays visible");
  } finally {
    await act(async () => { root.unmount(); });
    await win.happyDOM.close();
    for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  }
});
