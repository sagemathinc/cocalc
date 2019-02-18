const { redux } = require("../app-framework");

import { FileUseStore } from "./store";
import { FileUseActions } from "./actions";
import { FileUseTable } from "./table";

const store = redux.createStore("file_use", FileUseStore, {});
const actions = redux.createActions("file_use", FileUseActions);
redux.createTable("file_use", FileUseTable);
actions._init(); // must be after making store

// Function to updates the browser's awareness of a notification
require("../browser").set_notify_count_function(() => {
  store.get_notify_count();
});
