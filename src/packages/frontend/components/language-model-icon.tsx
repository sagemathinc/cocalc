import { CSS, useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  LLMServiceName,
  LanguageModel,
  SERVICES,
  fromCustomOpenAIModel,
  fromOllamaModel,
  fromUserDefinedLLMModel,
  isGoogleModel,
  isLanguageModel,
  isUserDefinedModel,
  model2vendor,
} from "@cocalc/util/db-schema/llm-utils";
import { unreachable } from "@cocalc/util/misc";
import AIAvatar from "./ai-avatar";
import AnthropicAvatar from "./anthropic-avatar";
import GoogleGeminiLogo from "./google-gemini-avatar";
import GooglePalmLogo from "./google-palm-avatar";
import MistralAvatar from "./mistral-avatar";
import OllamaAvatar from "./ollama-avatar";
import OpenAIAvatar from "./openai-avatar";
import XAIAvatar from "./xai-avatar";

export function LanguageModelVendorAvatar(
  props: Readonly<{
    model?: LanguageModel;
    size?: number;
    style?: CSS;
  }>,
) {
  const { model, size = 20 } = props;

  const ollama = useTypedRedux("customize", "ollama");
  const custom_openai = useTypedRedux("customize", "custom_openai");

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

  function renderImgIcon(icon: string, vendorName: string) {
    return (
      <img
        alt={`${vendorName} language model`}
        width={size}
        height={size}
        src={icon}
        style={{ display: "inline-block", ...style }}
      />
    );
  }

  function renderModel(model: string, vendor?: LLMServiceName) {
    const useIcon = vendor == null;
    const vendorName = vendor ?? model2vendor(model).name;
    switch (vendorName) {
      case "openai":
        return <OpenAIAvatar size={size} style={style} />;

      case "custom_openai": {
        const icon = custom_openai?.getIn([
          fromCustomOpenAIModel(model),
          "icon",
        ]);
        if (useIcon && typeof icon === "string") {
          return renderImgIcon(icon, vendorName);
        } else {
          return <OpenAIAvatar size={size} style={style} />;
        }
      }

      case "google": {
        if (model === "chat-bison-001") {
          // Palm2, no longer supported, just for backwards compatibility
          return <GooglePalmLogo size={size} style={style} />;
        } else if (!useIcon || isGoogleModel(model)) {
          return <GoogleGeminiLogo size={size} style={style} />;
        } else {
          return fallback();
        }
      }

      case "mistralai":
        return <MistralAvatar size={size} style={style} />;

      case "ollama": {
        const icon = ollama?.getIn([fromOllamaModel(model), "icon"]);
        if (useIcon && typeof icon === "string") {
          return renderImgIcon(icon, vendorName);
        } else {
          return <OllamaAvatar size={size} style={style} />;
        }
      }

      case "anthropic":
        return <AnthropicAvatar size={size} style={style} />;

      case "xai":
        return <XAIAvatar size={size} style={style} />;

      case "user":
        // should never happen, because it is unpacked below
        return fallback();

      default:
        unreachable(vendorName);
        return fallback();
    }
  }

  if (isUserDefinedModel(model)) {
    const udm = fromUserDefinedLLMModel(model);
    if (!udm) {
      return fallback();
    } else {
      // TODO: support a customizable icon for user defined LLMs
      for (const vendor of SERVICES) {
        if (udm.startsWith(`${vendor}-`)) {
          return renderModel(udm, vendor);
        }
      }
    }
  } else if (isLanguageModel(model)) {
    return renderModel(model);
  }

  return fallback();
}
