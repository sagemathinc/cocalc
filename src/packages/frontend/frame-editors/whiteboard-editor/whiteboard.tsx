import { useEditorRedux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { Actions, State } from "./actions";
import { Element } from "./types";
import Canvas from "./canvas";

interface Props {
  actions: Actions;
  path: string;
  project_id: string;
  font_size?: number;
}

export default function Whiteboard({
  actions,
  path,
  project_id,
  font_size,
}: Props) {
  const useEditor = useEditorRedux<State>({ project_id, path });
  actions = actions;

  const is_loaded = useEditor("is_loaded");
  const elements = useEditor("elements").toJS();

  if (!is_loaded) {
    return (
      <div
        style={{
          fontSize: "40px",
          textAlign: "center",
          padding: "15px",
          color: "#999",
        }}
      >
        <Loading />
      </div>
    );
  }

  const x: Element[] = [];
  for (const id in elements) {
    const element = elements[id];
    if (!element) continue;
    x.push(element);
  }
  return <Canvas elements={x} font_size={font_size} />;
}
