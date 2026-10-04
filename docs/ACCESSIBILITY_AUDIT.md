# Targeted accessibility audit specification

Audit the actual supplied page, flow, component, HTML, URL, or screenshot. If the
surface is unclear, state assumptions. Select 12 to 20 checks that are specific to the
surface. Cover keyboard completion, visible focus, name/role/value, form errors, and
relevant color contrast. Include table headers/scope, modal focus/Escape, media
alternatives, motion, and mobile reflow only when those elements exist.

Output YAML only with this structure:

```yaml
meta:
  product_surface: ""
  assumed_wcag_level: "AA"
  primary_user_scenarios: [""]
  out_of_scope: [""]
  assumptions: [""]
executive_summary: |
  Describe the highest risks in two to four sentences.
checklist:
  - id: A11Y-001
    category: Keyboard
    title: ""
    wcag_refs: ["2.1.1"]
    severity: high
    why_it_matters_here: ""
    how_to_test:
      - manual: ""
      - automated_hint: ""
    pass_criteria: ""
    remediation: ""
    owner_hint: frontend
priority_order: []
quick_wins:
  - id: A11Y-001
    effort: S
    impact: high
retest_plan:
  - after_fix: ""
    verify: ""
```

Allowed categories are Keyboard, Focus, Semantics, Forms, Media, Color Contrast,
Motion, Content, ARIA, and Mobile. Allowed severities are blocker, high, medium, and
low. Use blocker only when a primary scenario cannot be completed with keyboard or
assistive technology. Reference actual selectors when HTML exists. Calculate contrast
instead of guessing. Remediation must name the concrete markup or behavior change.
Never claim the page passes WCAG.
