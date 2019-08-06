import { Actions, Store, redux } from "./app-framework";

const NAME = "single_page";

interface SinglePageState {
  filename: string;
}

class SinglePageActions extends Actions<SinglePageState> {}

class SinglePageStore extends Store<SinglePageState> {
  getInitialState = function() {
    return {
      filename: "path/to/filename.ipynb"
    };
  };
}

redux.createStore(NAME, SinglePageStore);
redux.createActions(NAME, SinglePageActions);
