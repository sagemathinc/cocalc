import type { Cloud as CloudType } from "@cocalc/util/db-schema/compute-servers";
import { CLOUDS_BY_NAME } from "@cocalc/util/compute/cloud/clouds";
import { Icon, isIconName } from "@cocalc/frontend/components/icon";

interface Props {
  cloud: CloudType;
  height?: number | string;
  style?;
}

export default function DisplayCloud({ cloud, height, style }: Props) {
  const x = CLOUDS_BY_NAME[cloud];
  let label;
  if (x?.image) {
    label = <img src={x.image} height={height ?? 18} alt={x.label} />;
  } else {
    label = x?.label ?? cloud ?? "No Cloud Configured";
  }
  return (
    <span style={style}>
      {x?.icon && isIconName(x.icon) && <Icon name={x.icon} style={{ marginRight: "5px" }} />}
      {label}
    </span>
  );
}
