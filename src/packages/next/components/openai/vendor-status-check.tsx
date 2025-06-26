import {
  LLMServiceName,
  getLLMServiceStatusCheckMD,
} from "@cocalc/util/db-schema/llm-utils";
import { unreachable } from "@cocalc/util/misc";
import A from "components/misc/A";

import type { JSX } from "react";

export function LLMServiceStatusCheck({
  service,
}: {
  service: LLMServiceName;
}): JSX.Element {
  switch (service) {
    case "openai":
      return (
        <>
          OpenAI <A href="https://status.openai.com/">status</A> and{" "}
          <A href="https://downdetector.com/status/openai/">downdetector</A>.
        </>
      );

    case "google":
      return (
        <>
          Google <A href="https://status.cloud.google.com">status</A> and{" "}
          <A href="https://downdetector.com/status/google-cloud">
            downdetector
          </A>
          .
        </>
      );

    case "ollama":
      return (
        <>
          This Ollama based API endpoint does not have a status page. If you are
          experiencing issues you have to check with the API service directly or
          try again later.
        </>
      );

    case "custom_openai":
      return (
        <>
          This Custom OpenAI API endpoint does not have a status page. If you
          are experiencing issues you have to check with the API service
          directly or try again later.
        </>
      );

    case "mistralai":
      return (
        <>
          This Mistral based API endpoint does not have a status page. If you
          are experiencing issues, use another model or try again later.
        </>
      );

    case "anthropic":
      return (
        <>
          Anthropic <A href="https://status.anthropic.com/">status</A>.
        </>
      );

    case "user":
      return <>{getLLMServiceStatusCheckMD("user")}</>;

    default:
      unreachable(service);
  }
  return <></>;
}
