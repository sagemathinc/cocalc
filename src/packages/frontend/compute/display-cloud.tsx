import type { Cloud as CloudType } from "@cocalc/util/db-schema/compute-servers";
import { CLOUDS_BY_NAME } from "@cocalc/util/compute/cloud/clouds";

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
        <img src={x.image} height={height ?? 18} alt={x.label} />
      ) : (
        x?.label ?? cloud ?? "No Cloud Configured"
      )}
    </span>
  );
}
