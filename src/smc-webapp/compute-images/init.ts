const { redux, Store, Actions, Table } = require("../app-framework");
import { Map as iMap } from "immutable";

export const NAME = "compute_images";

export type ComputeImage = iMap<string, string>;
export type ComputeImages = iMap<string, ComputeImage>;

interface ComputeImagesState {
  images?: ComputeImages;
}

class ComputeImagesStore extends Store<ComputeImagesState> {}

class ComputeImagesActions<ComputeImagesState> extends Actions<
  ComputeImagesState
> {}

class ComputeImagesTable extends Table {
  constructor(NAME, redux) {
    super(NAME, redux);
    this._change = this._change.bind(this);
  }

  query() {
    return NAME;
  }

  options(): any[] {
    return [];
  }

  _change(table, _keys): void {
    const store: ComputeImagesStore | undefined = this.redux.getStore(NAME);
    if (store == null) throw Error("store must be defined");

    const actions = this.redux.getActions(NAME);
    if (actions == null) throw Error("actions must be defined");
    const data = table.get();
    console.log("ComputeImagesTable data:", data);
    actions.setState({ images: data });
  }
}

redux.createStore(NAME, ComputeImagesStore, {});
redux.createActions(NAME, ComputeImagesActions);
redux.createTable(NAME, ComputeImagesTable);
