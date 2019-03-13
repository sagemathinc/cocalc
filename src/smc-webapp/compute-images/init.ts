const { redux, Store, Actions, Table } = require("../app-framework");
import { Map as iMap } from "immutable";

export const NAME = "compute_images";

// this must match db-schema.compute_images → field type → allowed values
// legacy images are "default", "exp", or a timestamp
// custom iamges are "custom/<image-id>/<tag, usually latest>"
export type ComputeImageTypes = "legacy" | "custom";

// this must match db-schema.compute_images → field keys
export type ComputeImageKeys =
  | "id"
  | "src"
  | "type"
  | "display"
  | "url"
  | "desc";

export type ComputeImage = iMap<ComputeImageKeys, string>;
export type ComputeImages = iMap<string, ComputeImage>;

interface ComputeImagesState {
  images?: ComputeImages;
}

// derive the actual compute image name (which will be set in the DB) from the selected ID.
export function custom_image_name(id: string): string {
  let tag: string;
  if (id.indexOf(":") >= 0) {
    [id, tag] = id.split(":");
  } else {
    tag = "latest";
  }
  return `custom/${id}/${tag}`;
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
