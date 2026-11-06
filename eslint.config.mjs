import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
const config = [
  ...nextVitals, ...nextTypescript,
  { ignores: [".next/**", "node_modules/**", "public/**", "docs/**", "next-env.d.ts", "review-source/**"] },
  // Tests call helpers named `use` and build elements with createElement; they are not React components.
  { files: ["tests/**"], rules: { "react-hooks/rules-of-hooks": "off", "react/no-children-prop": "off" } },
  // TODO(phase-2 step 4): collections, customers and notes define sub-components inside render; they are rebuilt on the design system there.
  { files: ["src/components/collections.tsx", "src/components/customers.tsx", "src/components/notes.tsx"], rules: { "react-hooks/static-components": "warn" } },
];
export default config;
