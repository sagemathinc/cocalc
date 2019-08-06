import { Actions, Store, redux } from "./app-framework";
import { is_valid_uuid_string, filename_extension } from "../smc-util/misc2";

const NAME = "single_page";

export type Modes = "ipynb" | undefined;

interface SinglePageState {
  filename: string;
  mode: Modes;
  error?: string;
}

class SinglePageActions extends Actions<SinglePageState> {}

class SinglePageStore extends Store<SinglePageState> {
  getInitialState = function() {
    return {
      filename: "",
      mode: undefined,
      error: undefined
    };
  };
}

redux.createStore(NAME, SinglePageStore);
const actions = redux.createActions(NAME, SinglePageActions);

// set based on URL
// /single#bc6f81b3-25ad-4d58-ae4a-65649fae4fa5/python3.ipynb

import "./frame-editors/register";

function parse() {
  const url_data = decodeURIComponent(window.location.hash).slice(1);
  const i = url_data.indexOf("/");
  if (i < 20 || i > url_data.length - 1) return;
  const project_id = url_data.slice(0, i);
  if (!is_valid_uuid_string(project_id)) return;
  const path = url_data.slice(i + 1);
  actions.setState({ filename: path });
  console.log("OPEN", project_id, path);
  switch (filename_extension(path)) {
    case "ipynb":
      actions.setState({ mode: "ipynb" as Modes });
    default:
      actions.setState({ error: `I don't know what to do with ${path}` });
  }
}

parse();
