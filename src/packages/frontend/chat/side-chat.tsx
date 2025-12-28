import { CSS } from "@cocalc/frontend/app-framework";
import { useActions, useEditorRedux } from "@cocalc/frontend/app-framework";
import type { ChatActions } from "./actions";
import { ChatPanel } from "./chatroom";
import { ChatDocProvider, useChatDoc } from "./doc-context";
import type { ChatState } from "./store";

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
  const useEditor = useEditorRedux<ChatState>({ project_id, path });
  // subscribe to syncdbReady to force re-render when sync attaches
  useEditor("syncdbReady");

  return (
    <ChatDocProvider cache={actions.messageCache}>
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
  return (
    <ChatPanel
      actions={props.actions}
      project_id={props.project_id}
      path={props.path}
      messages={messages}
      fontSize={props.fontSize}
      desc={props.desc}
      variant="compact"
    />
  );
}
