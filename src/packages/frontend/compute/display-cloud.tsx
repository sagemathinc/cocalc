import type { Cloud as CloudType } from "@cocalc/util/db-schema/compute-servers";
import { CLOUDS_BY_NAME } from "@cocalc/util/compute/cloud/clouds";
import { Tooltip } from "antd";

interface Props {
  cloud: CloudType;
  height?: number | string;
  style?;
}

export default function DisplayCloud({ cloud, height, style }: Props) {
  const x = CLOUDS_BY_NAME[cloud];
  return (
    <span style={style}>
      {x?.image ? (
        <Tooltip title={x.label}>
          <img src={x.image} height={height ?? 18} alt={x.label} />
        </Tooltip>
      ) : (
        x?.label ?? cloud ?? "No Cloud Configured"
      )}
    </span>
  );
}
