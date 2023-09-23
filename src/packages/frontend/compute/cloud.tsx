import {
  CLOUDS_BY_NAME,
  Cloud as CloudType,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import { Select, Space, Spin, Tooltip } from "antd";
import { useEffect, useState } from "react";
import { setServerCloud } from "./api";

interface Props {
  cloud: CloudType;
  state?: State;
  editable?: boolean;
  height?: number | string;
  setError?;
  id?: number;
  setCloud?: (cloud: CloudType) => void;
  style?;
}

export default function Cloud({
  cloud,
  state,
  editable,
  height,
  setError,
  id,
  setCloud,
  style,
}: Props) {
  const [newCloud, setNewCloud] = useState<CloudType>(cloud);
  const [saving, setSaving] = useState<boolean>(false);
  useEffect(() => {
    setNewCloud(cloud);
  }, [cloud]);

  const x = CLOUDS_BY_NAME[cloud];
  const label = (
    <span>
      {x?.image ? (
        <img src={x.image} height={height ?? 18} />
      ) : (
        x?.label ?? "No Cloud Configured"
      )}
    </span>
  );
  if (!editable) {
    return label;
  }

  const options: { value: string; label: JSX.Element }[] = [];
  for (const cloud in CLOUDS_BY_NAME) {
    options.push({
      value: cloud,
      label: <Cloud editable={false} cloud={cloud as CloudType} />,
    });
  }

  if (state != "deleted" && setCloud == null) {
    return (
      <Tooltip
        title="You must first delete the compute server VM to enable changing the
          cloud provider."
      >
        <span>{label}</span>
      </Tooltip>
    );
  }

  return (
    <Space>
      <Select
        value={newCloud}
        style={{ width: 180, ...style }}
        onChange={async (value) => {
          if (value == newCloud) {
            // nothing to do
            return;
          }
          setNewCloud(value);
          if (setCloud != null) {
            setCloud(value);
          }
          if (id) {
            // save to backend
            try {
              setSaving(true);
              await setServerCloud({ cloud: value, id });
            } catch (err) {
              setError(`${err}`);
            } finally {
              setSaving(false);
            }
          }
        }}
        options={options}
      />
      {saving && <Spin />}
    </Space>
  );
}
