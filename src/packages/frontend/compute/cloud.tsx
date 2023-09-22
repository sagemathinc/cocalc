import { CLOUDS_BY_NAME } from "@cocalc/util/db-schema/compute-servers";

interface Props {
  cloud;
  editable?: boolean;
  height?: number | string;
}

export default function Cloud({ cloud, editable, height }: Props) {
  const x = CLOUDS_BY_NAME[cloud];
  if (!editable) {
    return (
      <span>
        {x?.image ? (
          <img src={x.image} height={height ?? 18} />
        ) : (
          x?.label ?? "No Cloud Configured"
        )}
      </span>
    );
  }

  return (
    <span>
      {x?.image ? (
        <img src={x.image} height={18} />
      ) : (
        x?.label ?? "Select a Cloud"
      )}
    </span>
  );
}
