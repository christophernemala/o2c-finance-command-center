import type { AiSpendController } from "../src/lib/ai/budget";

/** Unit-test double only. Provider-backed production entry points require the PostgreSQL controller. */
export const testSpend: AiSpendController = {
  reserve: async () => {},
  settle: async () => {},
  release: async () => {},
};
