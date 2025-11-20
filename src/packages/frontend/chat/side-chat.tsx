import { CSS } from "@cocalc/frontend/app-framework";
import { useActions, useRedux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import type { ChatActions } from "./actions";
import { ChatPanel } from "./chatroom";
import type { ChatMessages } from "./types";

interface Props {
  project_id: string;
  path: string;
  style?: CSS;
  fontSize?: number;
  actions?: ChatActions;
  desc?;
}

export default function SideChat({
  actions: actions0,
  project_id,
  path,
  style,
  fontSize,
  desc,
}: Props) {
  const actionsViaContext = useActions(project_id, path);
  const actions: ChatActions = actions0 ?? actionsViaContext;
  const messages = useRedux(["messages"], project_id, path) as
    | ChatMessages
    | undefined;

  if (messages == null) {
    return <Loading theme="medium" />;
  }

  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#efefef",
        ...style,
      }}
    >
      <ChatPanel
        actions={actions}
        project_id={project_id}
        path={path}
        messages={messages}
        fontSize={fontSize}
        desc={desc}
        variant="compact"
        disableFilters
      />
    </div>
  );
}
