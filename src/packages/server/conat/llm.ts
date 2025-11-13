import { init as init0, close } from "@cocalc/conat/llm/server";
import { evaluate } from "@cocalc/server/llm/index";

export async function init() {
  await init0(evaluate);
}

export { close };
