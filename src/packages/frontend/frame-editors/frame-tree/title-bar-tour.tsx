import { Tour } from "antd";
import type { TourProps } from "antd";
import { useMemo } from "react";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

export default function TitleBarTour({ refs }) {
  const { id, actions, desc } = useFrameContext();

  const open = desc.get("tour");

  const steps: TourProps["steps"] = useMemo(() => {
    if (open) {
      if (!someRefIsDefined(refs)) {
        // none defined, so frame just opened and old desc hanging around.
        actions.set_frame_tree({ id, tour: false });
        return [];
      }
      return actions.tour?.(id, refs.current) ?? [];
    } else {
      return [];
    }
  }, [actions, open]);

  return (
    <Tour
      zIndex={10001}
      open={open}
      onClose={() => {
        actions.set_frame_tree({ id, tour: false });
      }}
      steps={steps}
    />
  );
}

function someRefIsDefined(refs) {
  for (const name in refs.current) {
    if (refs.current[name]?.current != null) {
      return true;
    }
  }
  return false;
}
