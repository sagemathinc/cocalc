import { Button } from "antd";

import { ChatActions } from "@cocalc/frontend/chat/actions";
import { Icon, Tip } from "@cocalc/frontend/components";

export function FoldAllThreads({
  actions,
  shortLabel,
}: {
  actions: ChatActions;
  shortLabel: boolean;
}) {
  return (
    <Tip placement="top" title="Fold all language model threads">
      <Button
        onClick={() => {
          actions.foldAllThreads(true);
        }}
      >
        <Icon name="to-top-outlined" />{" "}
        {shortLabel ? "LLM" : "Fold LLM threads"}
      </Button>
    </Tip>
  );
}
