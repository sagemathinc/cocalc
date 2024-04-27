import { useEffect, useState } from "react";
import { getTemplates } from "./api";
import type { ConfigurationTemplate } from "@cocalc/util/compute/templates";

export default function PublicTemplates() {
  const [templates, setTemplates] = useState<ConfigurationTemplate | null>(
    null,
  );

  useEffect(() => {
    (async () => {
      setTemplates(await getTemplates());
    })();
  }, []);

  return (
    <div>
      public templates
      <pre>{JSON.stringify(templates, undefined, 2)}</pre>
    </div>
  );
}
