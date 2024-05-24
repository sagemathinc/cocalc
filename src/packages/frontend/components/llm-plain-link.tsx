import { LanguageModel, model2vendor } from "@cocalc/util/db-schema/llm-utils";
import { modelToName } from "../frame-editors/llm/llm-selector";
import { A } from "./A";

export function LLMNameLink({ model }: { model: LanguageModel }) {
  return <A href={model2vendor(model).url}>{modelToName(model)}</A>;
}
