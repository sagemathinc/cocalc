import { Vendor } from "@cocalc/util/db-schema/openai";
import { unreachable } from "@cocalc/util/misc";
import A from "components/misc/A";

export function VendorStatusCheck({ vendor }: { vendor: Vendor }): JSX.Element {
  switch (vendor) {
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
    default:
      unreachable(vendor);
  }
  return <></>;
}
