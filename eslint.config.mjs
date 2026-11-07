import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
const config = [
  ...nextVitals, ...nextTypescript,
  { ignores: [".next/**", ".vercel/**", "node_modules/**", "public/**", "docs/**", "next-env.d.ts", "review-source/**"] },
];
export default config;
