import { CSS } from "@cocalc/frontend/app-framework";
import {
  LanguageModel,
  isLanguageModel,
  isOllamaLLM,
  model2vendor,
} from "@cocalc/util/db-schema/llm";
import { unreachable } from "@cocalc/util/misc";
import AIAvatar from "./ai-avatar";
import GoogleGeminiLogo from "./google-gemini-avatar";
import GooglePalmLogo from "./google-palm-avatar";
import OllamaAvatar from "./ollama-avatar";
import OpenAIAvatar from "./openai-avatar";

export function LanguageModelVendorAvatar(
  props: Readonly<{
    model?: LanguageModel;
    size?: number;
    style?: CSS;
  }>,
) {
  const { model, size = 24 } = props;

  const style: CSS = {
    marginRight: "5px",
    ...props.style,
  } as const;

  function fallback() {
    return <AIAvatar size={size} style={style} />;
  }

  if (model == null) {
    return fallback();
  }

  if (isLanguageModel(model)) {
    const vendor = model2vendor(model);
    switch (vendor) {
      case "openai":
        return <OpenAIAvatar size={size} style={style} />;
      case "google": {
        switch (model) {
          case "chat-bison-001":
            return <GooglePalmLogo size={size} style={style} />;
          case "gemini-pro":
            return <GoogleGeminiLogo size={size} style={style} />;
          default:
            return fallback();
        }
      }

      case "ollama":
        return <OllamaAvatar size={size} style={style} />;

      default:
        unreachable(vendor);
        return fallback();
    }
  }

  if (isOllamaLLM(model)) {
    return <OllamaAvatar size={size} style={style} />;
  }

  return fallback();
}
