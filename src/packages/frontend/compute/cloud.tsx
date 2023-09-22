import { CLOUDS_BY_NAME } from "@cocalc/util/db-schema/compute-servers";
import { Tooltip } from "antd";

interface Props {
  cloud;
  id: number;
  editable?: boolean;
  height?: number | string;
}

export default function Cloud({ cloud, id, editable, height }: Props) {
  const x = CLOUDS_BY_NAME[cloud];
  if (!editable) {
    return (
      <div>
        {x?.image ? (
          <img src={x.image} height={height ?? 18} />
        ) : (
          x?.label ?? "No Cloud Configured"
        )}
      </div>
    );
  }

  return (
    <div>
      {x?.image ? (
        <img src={x.image} height={18} />
      ) : (
        x?.label ?? "Select a Cloud"
      )}
    </div>
  );
}
