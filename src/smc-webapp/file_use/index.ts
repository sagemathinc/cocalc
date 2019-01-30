import { redux } from "../app-framework";
export { FileUseStore }  from "./store";
export { FileUseActions }  from "./actions";
export { FileUseTable }  from "./table";
export { FileUsePage }  from "./components";
import { FileUseStore }  from "./store";
import { FileUseActions }  from "./actions";
import { FileUseTable }  from "./table";

function init_redux(redux) {
  if (redux.getActions("file_use") == null) {
    redux.createStore("file_use", FileUseStore, {});
    const actions = redux.createActions("file_use", FileUseActions);
    redux.createTable("file_use", FileUseTable);
    actions._init(); // must be after making store
  }
}

init_redux(redux);

// Updates the browser's awareness of a notification
require("../browser").set_notify_count_function(() =>
  redux.getStore("file_use").get_notify_count()
);
