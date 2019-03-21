// Manage DB <-> UI integration of available *custom* compute images
// TODO: also get rid of hardcoded legacy software images

const { redux, Store, Actions, Table } = require("../app-framework");
import { Map as iMap } from "immutable";

const { capitalize } = require("smc-util/misc");

export const NAME = "compute_images";

// this must match db-schema.compute_images → field type → allowed values
// legacy images are "default", "exp", or a timestamp
// custom iamges are "custom/<image-id>/<tag, usually latest>"
export type ComputeImageTypes = "legacy" | "custom";

// this must be compatible with db-schema.compute_images → field keys
export type ComputeImageKeys =
  | "id"
  | "src"
  | "type"
  | "display"
  | "url"
  | "desc"
  | "search_str";

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

export function id2name(id: string): string {
  return id
    .split("-")
    .map(capitalize)
    .join(" ");
}

function fallback(
  img: ComputeImage,
  key: ComputeImageKeys,
  replace: (img: ComputeImage) => string
): string {
  const ret = img.get(key);
  if (ret == null || ret.length == 0) {
    return replace(img);
  }
  return ret;
}

function display_fallback(img: ComputeImage, id: string) {
  return fallback(img, "display", _ => id2name(id));
}

function desc_fallback(img: ComputeImage) {
  return fallback(img, "desc", _ => "*No description available.*");
}

function url_fallback(img: ComputeImage) {
  const planB = (img: ComputeImage) => {
    const src = img.get("src", undefined);
    if (src != null && src.length > 0) {
      if (src.indexOf("://github.com") > 0) {
        if (src.endsWith(".git")) {
          return src.slice(0, -".git".length);
        } else {
          return src;
        }
      }
    }
    return "";
  };
  return fallback(img, "url", planB);
}

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

  prepare(data: ComputeImages): ComputeImages {
    // console.log("ComputeImagesTable data:", data);
    return data.map((img, id) => {
      const display = display_fallback(img, id);
      const desc = desc_fallback(img);
      const url = url_fallback(img);
      const search_str = `${id} ${display} ${desc} ${url}`
        .split(" ")
        .filter(x => x.length > 0)
        .join(" ")
        .toLowerCase();

      return img
        .set("display", display)
        .set("desc", desc)
        .set("search_str", search_str)
        .set("url", url);
    });
  }

  _change(table, _keys): void {
    const store: ComputeImagesStore | undefined = this.redux.getStore(NAME);
    if (store == null) throw Error("store must be defined");
    const actions = this.redux.getActions(NAME);
    if (actions == null) throw Error("actions must be defined");
    const data = table.get();
    actions.setState({ images: this.prepare(data) });
  }
}

redux.createStore(NAME, ComputeImagesStore, {});
redux.createActions(NAME, ComputeImagesActions);
redux.createTable(NAME, ComputeImagesTable);
