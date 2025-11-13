import { redux } from "@cocalc/frontend/app-framework";
import { Text } from "@cocalc/frontend/components";

export function getCustomLLMGroup() {
  const customize = redux.getStore("customize");
  const site_name = customize.get("site_name");
  const organization_name = customize.get("organization_name") ?? "";
  return {
    title: `Managed by ${organization_name || site_name}`,
    label: (
      <>
        <Text strong>{site_name} language models</Text>
      </>
    ),
  };
}
