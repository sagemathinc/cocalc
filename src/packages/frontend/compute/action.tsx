import { Button, Popconfirm, Popover, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components";
import {
  ACTION_INFO,
  STATE_INFO,
} from "@cocalc/util/db-schema/compute-servers";
import { useEffect, useState } from "react";
import { computeServerAction } from "./api";

export default function getActions({
  id,
  state,
  editable,
  setError,
}): JSX.Element[] {
  if (!editable) {
    return [];
  }
  const s = STATE_INFO[state ?? "off"];
  if (s == null) {
    return [];
  }
  if ((s.actions ?? []).length == 0) {
    return [];
  }
  const v: JSX.Element[] = [];
  for (const action of s.actions) {
    const a = ACTION_INFO[action];
    if (!a) continue;
    const { label, icon, tip, description, confirm } = a;
    v.push(
      <ActionButton
        id={id}
        action={action}
        label={label}
        icon={icon}
        tip={tip}
        description={description}
        setError={setError}
        confirm={confirm}
      />,
    );
  }
  return v;
}

function ActionButton({
  id,
  action,
  icon,
  label,
  description,
  tip,
  setError,
  confirm,
}) {
  const [doing, setDoing] = useState<boolean>(false);
  const doAction = async () => {
    try {
      setDoing(true);
      await computeServerAction({ id, action });
    } catch (err) {
      setError(`${err}`);
    } finally {
      setDoing(false);
    }
  };
  useEffect(() => {
    setDoing(false);
  }, []);

  let button = (
    <Button
      disabled={doing}
      type="text"
      onClick={!confirm ? doAction : undefined}
    >
      <Icon name={icon} /> {label}{" "}
      {doing && (
        <>
          <div style={{ display: "inline-block", width: "10px" }} />
          <Spin />
        </>
      )}
    </Button>
  );
  if (confirm) {
    button = (
      <Popconfirm
        title={`${label} - Are you sure?`}
        description={<div style={{ width: "400px" }}>{description}</div>}
        onConfirm={doAction}
        okText="Yes"
        cancelText="Cancel"
      >
        {button}
      </Popconfirm>
    );
  }

  return (
    <Popover
      key={action}
      mouseEnterDelay={0.5}
      title={
        <div>
          <Icon name={icon} /> {tip}
        </div>
      }
      content={<div style={{ width: "400px" }}>{description}</div>}
    >
      {button}
    </Popover>
  );
}
