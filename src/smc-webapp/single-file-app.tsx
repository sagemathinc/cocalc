import * as React from "react";
import { Provider } from "react-redux";

import { AppRedux, redux_name } from "./app-framework";
import * as Project from "./project_store";

import { Editor } from "./frame-editors/jupyter-editor/editor";
import { JupyterEditorActions } from "./frame-editors/jupyter-editor/actions";

interface Props {
  go_to_main_app: () => void;
  redux: AppRedux;
}

// TODO: Parse the URL
function parse_url(_url: string): { project_id: string } {
  return { project_id: "04b92541-6075-4707-a61a-d910ba5056eb" };
}

function project_id_to_path(project_id: string): string {
  return `${project_id}.ipynb`;
}

export const App: React.FC<Props> = ({ go_to_main_app, redux }) => {
  const url = window.location.pathname;
  const project_id = parse_url(url).project_id;

  const [state, setState] = React.useState<{ name: string; path: string }>();

  React.useEffect(() => {
    // 1. Init "Page"
    require("./init_app");

    // 2. Init Account

    // 3. Init "Projects"

    // 4. Connect to the project.
    Project.init(project_id, redux);
    const path = project_id_to_path(project_id);
    const is_public = true;
    const name = (function init_jupyter_frame(
      path,
      redux,
      project_id,
      is_public
    ): string {
      const name = redux_name(project_id, path, is_public);
      if (redux.getActions(name) != undefined) {
        return name; // Already initialized
      }
      // We purposely are just using the simple default store; that's all that is needed
      // for these editors.
      const store = redux.createStore(name);
      const actions = redux.createActions(name, JupyterEditorActions);

      // Call the base class init.  (NOTE: it also calls _init2 if defined.)
      actions._init(project_id, path, is_public, store);
      return name;
    })(path, redux, project_id, is_public);

    setState({ name, path });
  }, [redux, project_id]);

  return (
    <Provider store={redux._redux_store}>
      <div
        style={{ width: "100vw", height: "100vh", background: "lavenderblush" }}
      >
        New hot application!
        <div
          style={{
            margin: "10px",
            width: "175px",
            height: "100px",
            background: "red"
          }}
          onClick={(e): void => {
            e.preventDefault();
            go_to_main_app();
          }}
        >
          Get me out of here!
        </div>
        {state ? (
          <Editor
            actions={redux.getActions(name)}
            name={state.name}
            path={state.path}
            project_id={project_id}
          />
        ) : (
          undefined
        )}
      </div>
    </Provider>
  );
};
