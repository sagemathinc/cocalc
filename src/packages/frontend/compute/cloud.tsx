import {
  Cloud as CloudType,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import { CLOUDS_BY_NAME } from "@cocalc/util/compute/cloud/clouds";
import { Select, Space, Spin, Tooltip } from "antd";
import { useEffect, useState } from "react";
import { setServerCloud } from "./api";
import { useStore } from "@cocalc/frontend/app-framework";
import DisplayCloud from "./display-cloud";

interface Props {
  cloud: CloudType;
  state?: State;
  editable?: boolean;
  height?: number | string;
  setError?;
  id?: number;
  setCloud?: (cloud: CloudType) => void;
  style?;
  onChange?;
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
  const customize = useStore("customize");
  useEffect(() => {
    setNewCloud(cloud);
  }, [cloud]);

  const label = (
    <DisplayCloud
      cloud={cloud}
      height={height}
      style={!editable ? style : undefined}
    />
  );
  if (!editable) {
    return label;
  }

  const options: { value: string; label: React.JSX.Element; key: string }[] = [];
  for (const cloud in CLOUDS_BY_NAME) {
    if (customize?.get(`compute_servers_${cloud}_enabled`)) {
      options.push({
        key: cloud,
        value: cloud,
        label: <Cloud editable={false} cloud={cloud as CloudType} />,
      });
    }
  }

  if (state != "deprovisioned" && setCloud == null) {
    return (
      <Tooltip
        title="You must first deprovision the compute server VM before you can change the
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
