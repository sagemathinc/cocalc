import { CSS } from "@cocalc/frontend/app-framework";
import { useActions } from "@cocalc/frontend/app-framework";
import type { ChatActions } from "./actions";
import { ChatPanel } from "./chatroom";
import { ChatDocProvider, useChatDoc } from "./doc-context";

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

  return (
    <ChatDocProvider
      syncdb={(actions as any)?.syncdb}
      cache={(actions as any)?.messageCache}
    >
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
        <SideChatInner
          actions={actions}
          project_id={project_id}
          path={path}
          fontSize={fontSize}
          desc={desc}
        />
      </div>
    </ChatDocProvider>
  );
}

function SideChatInner(props: Props & { actions: ChatActions }) {
  const { messages } = useChatDoc();
  const msgs = messages ?? new Map();
  return (
    <ChatPanel
      actions={props.actions}
      project_id={props.project_id}
      path={props.path}
      messages={msgs}
      fontSize={props.fontSize}
      desc={props.desc}
      variant="compact"
      disableFilters
    />
  );
}
