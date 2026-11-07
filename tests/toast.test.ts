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

test("danger toasts stay until dismissed; other toasts hide when their 6 s timer fires", async () => {
  const win = new Window({ url: "http://localhost/?view=notes" });
  const globals = { window: win, self: win, document: win.document, navigator: win.navigator, HTMLElement: win.HTMLElement, Element: win.Element, IS_REACT_ACT_ENVIRONMENT: true };
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries(globals)) { saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { value, writable: true, configurable: true }); }
  // A controllable clock: timers are recorded and fired by the test, never by wall time.
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const clock = win as unknown as { setTimeout: (fn: () => void, ms?: number) => number; clearTimeout: (id: number) => void };
  clock.setTimeout = (fn, ms = 0) => timers.push({ fn, ms, cleared: false });
  clock.clearTimeout = id => { const timer = timers[id - 1]; if (timer) timer.cleared = true; };
  const fireAll = async () => { await act(async () => { for (const timer of timers) if (!timer.cleared) { timer.cleared = true; timer.fn(); } }); };
  const { createRoot } = await import("react-dom/client");
  const { Toast } = await import("../src/components/ui/overlay");
  const container = win.document.createElement("div"); win.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const shown = () => container.querySelector(".ds-toast span")?.textContent ?? null;
  try {
    await act(async () => { root.render(createElement(Toast, { message: "Rejected: refresh and try again", id: "d1", tone: "danger" })); });
    await fireAll();
    assert.equal(shown(), "Rejected: refresh and try again", "a danger toast is still visible after every pending timer has fired");
    await act(async () => { root.render(createElement(Toast, { message: "Saved", id: "s1", tone: "success" })); });
    assert.equal(shown(), "Saved");
    assert.ok(timers.some(timer => timer.ms === 6000 && !timer.cleared), "a success toast schedules a 6 s auto-hide");
    await fireAll();
    assert.equal(shown(), null, "the success toast hides when its timer fires");
  } finally {
    await act(async () => { root.unmount(); });
    await win.happyDOM.close();
    for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  }
});

test("the server sends an empty live region and the toast appears after hydration, so it is announced", async () => {
  const win = new Window({ url: "http://localhost/?view=notes&message=Saved&nonce=h1" });
  const globals = { window: win, self: win, document: win.document, navigator: win.navigator, HTMLElement: win.HTMLElement, Element: win.Element, IS_REACT_ACT_ENVIRONMENT: true };
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries(globals)) { saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { value, writable: true, configurable: true }); }
  const { hydrateRoot } = await import("react-dom/client");
  const { renderToString } = await import("react-dom/server");
  const { Toast } = await import("../src/components/ui/overlay");
  const element = createElement(Toast, { message: "Saved", id: "h1", tone: "success" });
  const container = win.document.createElement("div"); win.document.body.append(container);
  container.innerHTML = renderToString(element);
  try {
    assert.equal(container.querySelector(".ds-toast-region")?.textContent, "", "the live region arrives empty from the server");
    let root: { unmount(): void } | undefined;
    await act(async () => { root = hydrateRoot(container as unknown as HTMLElement, element); });
    assert.equal(container.querySelector(".ds-toast span")?.textContent, "Saved", "the toast is inserted after hydration");
    await act(async () => { root?.unmount(); });
  } finally {
    await win.happyDOM.close();
    for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  }
});
