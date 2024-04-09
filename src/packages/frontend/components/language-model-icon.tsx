import { CSS } from "@cocalc/frontend/app-framework";
import {
  LanguageModel,
  isGoogleModel,
  isLanguageModel,
  isOllamaLLM,
  model2vendor,
} from "@cocalc/util/db-schema/llm-utils";
import { unreachable } from "@cocalc/util/misc";
import AIAvatar from "./ai-avatar";
import GoogleGeminiLogo from "./google-gemini-avatar";
import GooglePalmLogo from "./google-palm-avatar";
import MistralAvatar from "./mistral-avatar";
import OllamaAvatar from "./ollama-avatar";
import OpenAIAvatar from "./openai-avatar";
import AnthropicAvatar from "./anthropic-avatar";

export function LanguageModelVendorAvatar(
  props: Readonly<{
    model?: LanguageModel;
    size?: number;
    style?: CSS;
  }>,
) {
  const { model, size = 20 } = props;

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
        if (model === "chat-bison-001") {
          // Palm2, no longer supported, just for backwards compatibility
          return <GooglePalmLogo size={size} style={style} />;
        } else if (isGoogleModel(model)) {
          return <GoogleGeminiLogo size={size} style={style} />;
        } else {
          return fallback();
        }
      }

      case "mistralai":
        return <MistralAvatar size={size} style={style} />;

      case "ollama":
        return <OllamaAvatar size={size} style={style} />;

      case "anthropic":
        return <AnthropicAvatar size={size} style={style} />;

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
