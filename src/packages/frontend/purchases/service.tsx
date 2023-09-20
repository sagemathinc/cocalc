import { Tag } from "antd";
import { Service, QUOTA_SPEC } from "@cocalc/util/db-schema/purchase-quotas";

export default function ServiceTag({
  service,
  style,
}: {
  service: Service;
  style?;
}) {
  const spec = QUOTA_SPEC[service];
  return (
    <Tag style={style} color={spec?.color}>
      {spec?.display ?? service}
    </Tag>
  );
}
