/*
Register the TimeTravel frame tree editor
*/

import { Editor } from "./editor";
import { TimeTravelActions } from "./actions";

import { register_file_editor } from "../frame-tree/register";

register_file_editor({
  ext: "time-travel",
  component: Editor,
  Actions: TimeTravelActions,
  is_public: false,
});
