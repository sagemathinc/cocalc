//import { redux } from "@cocalc/frontend/app-framework";
//import { JupyterEditorActions } from "@cocalc/frontend/frame-editors/jupyter-editor/actions";
//import { aux_file } from "@cocalc/util/misc";
/*
  const { project_id, path } = useFrameContext();
  const aux_path = aux_file(path, "ipynb");
  const actions = redux.getEditorActions(project_id, aux_path) as
    | JupyterEditorActions
    | undefined;
  if (actions == null) {
    return <div>TODO</div>;
  }
  const store = actions.jupyter_actions.store;
  const id = element.str ?? "todo";
  const cell = store.get("cells").get(id);
  if (cell == null) {
    return <div>Create cell '{id}'</div>;
  }
  const cm_options = store.get("cm_options");
  const style = {
    fontSize: `${element.data?.fontSize}px`,
    borderLeft: element.data?.color
      ? `5px solid ${element.data?.color}`
      : undefined,
  };

  return (
    <div style={style}>
      <Cell
        cell={cell}
        cm_options={cm_options}
        mode="edit"
        font_size={element.data?.fontSize ?? 14}
        project_id={project_id}
      />
    </div>
  );

  */