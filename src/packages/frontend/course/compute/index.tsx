import { Button } from "antd";
import { useMemo, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import type { ComputeServerConfig } from "../types";
import type { CourseActions } from "../actions";
import type { HandoutRecord, AssignmentRecord } from "../store";
import ComputeServer from "@cocalc/frontend/compute/inline";
import ComputeServerModal from "./modal";

interface Props {
  style?;
  actions: CourseActions;
  assignment_or_handout: HandoutRecord | AssignmentRecord;
}

export function ComputeServerButton({
  style,
  actions,
  assignment_or_handout,
}: Props) {
  const [open, setOpen] = useState<boolean>(false);
  const config: ComputeServerConfig = useMemo(() => {
    return (assignment_or_handout as any).get("compute_server")?.toJS() ?? {};
  }, [assignment_or_handout]);

  return (
    <>
      <Button
        style={style}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <Icon name="server" />
        {!!config.id ? (
          <ComputeServer id={config.id} titleOnly />
        ) : (
          "Compute Server..."
        )}
      </Button>
      {open && (
        <ComputeServerModal
          onClose={() => setOpen(false)}
          actions={actions}
          config={config}
          setConfig={(config: ComputeServerConfig) => {
            const x = assignment_or_handout as any;
            if (x.get("handout_id") != null) {
              actions.handouts.setComputeServerConfig(
                x.get("handout_id"),
                config,
              );
            } else if (x.get("assignment_id")) {
              actions.assignments.setComputeServerConfig(
                x.get("assignment_id"),
                config,
              );
            } else {
              throw Error("assignment_or_handout must not be null");
            }
          }}
        />
      )}
    </>
  );
}
