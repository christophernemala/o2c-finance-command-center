import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FinanceWorkspace } from "../src/components/workspace";
import { AgentFlowArcs } from "../src/components/agent-flow-arcs";
import { syntheticEntities, syntheticMemberships, syntheticSnapshot, syntheticViewerId } from "../src/lib/demo/synthetic";

test("overview keeps exactly five KPI cards on the rendered workspace", () => {
  const html = renderToStaticMarkup(createElement(FinanceWorkspace, {
    memberships: syntheticMemberships,
    entityOptions: syntheticEntities,
    data: syntheticSnapshot,
    view: "overview",
    userId: syntheticViewerId,
    email: "local-preview@example.invalid",
    previewMode: true,
  }));
  const cards = html.match(/class="metric-tile metric-tone-\d p-5"/g) ?? [];
  assert.equal(cards.length, 5);
  for (const label of ["Total AR", "Overdue AR", "DSO", "CEI", "Unapplied cash"]) {
    assert.ok(html.includes(label), label);
  }
});

test("phone dock exposes overview, receivables, collections, cash application, and More", () => {
  const html = renderToStaticMarkup(createElement(FinanceWorkspace, {
    memberships: syntheticMemberships,
    entityOptions: syntheticEntities,
    data: syntheticSnapshot,
    view: "overview",
    userId: syntheticViewerId,
    email: "local-preview@example.invalid",
    previewMode: true,
  }));
  const label = html.indexOf('aria-label="Primary navigation"');
  const start = html.lastIndexOf("<nav", label);
  assert.notEqual(start, -1, "primary mobile navigation exists");
  const more = html.indexOf("<details", label);
  const directLinks = html.slice(start, more);
  for (const destination of ["Overview", "Receivables", "Collections", "Cash app"]) {
    assert.ok(directLinks.includes(destination), destination);
  }
  assert.equal((directLinks.match(/<a\b/g) ?? []).length, 4, "four core destinations stay directly reachable");
  const moreMenu = html.slice(more, html.indexOf('<main id="main"', more));
  assert.match(moreMenu, /aria-label="More workspaces"/);
});

test("decorative flow arcs start visible for stable reduced-motion hydration", () => {
  const html = renderToStaticMarkup(createElement(AgentFlowArcs));
  assert.match(html, /stroke-dasharray="1 1"/);
  assert.equal((html.match(/style="opacity:1"/g) ?? []).length, 4);
  assert.match(html, /aria-hidden="true"/);
});
