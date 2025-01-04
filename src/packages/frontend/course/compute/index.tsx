import { Button } from "antd";
import { useMemo, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import type { ComputeServerConfig } from "../types";
import type { CourseActions } from "../actions";
import type { Unit } from "../store";
import ComputeServer from "@cocalc/frontend/compute/inline";
import ComputeServerModal from "./modal";

interface Props {
  style?;
  actions: CourseActions;
  unit: Unit;
}

export function ComputeServerButton({ style, actions, unit }: Props) {
  const [open, setOpen] = useState<boolean>(false);
  const config: ComputeServerConfig = useMemo(() => {
    return unit.get("compute_server")?.toJS() ?? {};
  }, [unit]);

  return (
    <>
      <Button
        style={style}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <Icon name="server" />
        {!!config.server_id ? (
          <ComputeServer id={config.server_id} titleOnly />
        ) : (
          "Compute Server..."
        )}
      </Button>
      {open && (
        <ComputeServerModal
          unit={unit}
          onClose={() => setOpen(false)}
          actions={actions}
        />
      )}
    </>
  );
}
