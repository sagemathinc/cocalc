import { authFirst } from "./util";
import type { ChatOptionsApi } from "@cocalc/util/types/llm";

export const llm = {
  evaluate: authFirst,
};

export interface LLM {
  evaluate: (
    opts: ChatOptionsApi,
  ) => Promise<{ subject: string; streamName: string }>;
}
