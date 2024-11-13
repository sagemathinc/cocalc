import { Tag, Tooltip } from "antd";
import { Service, QUOTA_SPEC } from "@cocalc/util/db-schema/purchase-quotas";

export default function ServiceTag({
  service,
  style,
}: {
  service: Service;
  style?;
}) {
  const spec = QUOTA_SPEC[service];
  let tag = (
    <Tag
      style={{
        whiteSpace: "pre-wrap",
        cursor: "pointer",
        ...style,
      }}
      color={spec?.color}
    >
      {spec?.display ?? service}
    </Tag>
  );
  if (spec.description) {
    return <Tooltip title={spec.description}>{tag}</Tooltip>;
  } else {
    return tag;
  }
}
