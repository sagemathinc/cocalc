import { ReactNode } from "react";
import { useEditorRedux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { Actions, State } from "./actions";

interface Props {
  actions: Actions;
  path: string;
  project_id: string;
  font_size: number;
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
  const objects = useEditor("objects").toJS();

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

  const v: ReactNode[] = [];
  for (const id in objects) {
    const object = objects[id];
    if (!object) continue;
    const { css, str, data } = objects[id];
    v.push(
      <div key={id} style={{ position: "relative", ...css }}>
        {str != null && str}
        {data != null && <pre>{JSON.stringify(data, undefined, 2)}</pre>}
      </div>
    );
  }

  const zoom = font_size ? font_size / 14 : undefined;

  return (
    <div className={"smc-vfill"} style={{ zoom }}>
      {v}
    </div>
  );
}
