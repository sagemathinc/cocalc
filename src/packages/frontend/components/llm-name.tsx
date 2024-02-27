import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { modelToName } from "@cocalc/frontend/frame-editors/llm/model-switch";
import {
  fromOllamaModel,
  isLanguageModel,
  isOllamaLLM,
} from "@cocalc/util/db-schema/llm";
import { LanguageModelVendorAvatar } from "./language-model-icon";

export function LLMModelName(props: Readonly<{ model: string }>) {
  const { model } = props;

  const ollama = useTypedRedux("customize", "ollama");

  function renderTitle() {
    if (isLanguageModel(model)) {
      return modelToName(model);
    }

    if (isOllamaLLM(model)) {
      const om = ollama?.get(fromOllamaModel(model));
      if (om) {
        return om.get("display") ?? `Ollama ${model}`;
      }
    }
    return model;
  }

  return (
    <>
      <LanguageModelVendorAvatar model={model} /> {renderTitle()}
    </>
  );
}
