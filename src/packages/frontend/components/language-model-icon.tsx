import { isLanguageModel, model2vendor } from "@cocalc/util/db-schema/openai";

import GooglePalmLogo from "./google-palm-avatar";
import AIAvatar from "./ai-avatar";
import OpenAIAvatar from "./openai-avatar";
import { unreachable } from "@cocalc/util/misc";

export function LanguageModelVendorAvatar({
  model,
  size = 24,
}: {
  model?: string;
  size?: number;
}) {
  function fallback() {
    return <AIAvatar size={size} style={{ marginRight: "5px" }} />;
  }

  if (isLanguageModel(model)) {
    const vendor = model2vendor(model);
    switch (vendor) {
      case "openai":
        return <OpenAIAvatar size={size} style={{ marginRight: "5px" }} />;
      case "google":
        return <GooglePalmLogo size={size} style={{ marginRight: "5px" }} />;
      default:
        unreachable(vendor);
        return fallback();
    }
  } else {
    return fallback();
  }
}
