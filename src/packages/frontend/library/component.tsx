/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
To work on this make sure /ext/library/ exists:

$ ls /ext/library/
cocalc-examples  update.sh
$ more update.sh
[...]
git clone --depth=1 https://github.com/sagemathinc/cocalc-examples.git
cd cocalc-examples/
git submodule update --init --recursive --depth 1
make
[...]

*/

import { join } from "path";
import { path_split, search_match, search_split } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import track from "@cocalc/frontend/user-tracking";
import {
  useActions,
  useMemo,
  useState,
  useTypedRedux,
  CSS,
  Fragment,
} from "../app-framework";
import { List, Col, Row, Button } from "antd";
import {
  Markdown,
  Icon,
  Loading,
  SearchInput,
} from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";

// used for some styles
const HEIGHT = "275px";

interface Props {
  project_id: string;
  onClose?: () => void;
}

// This is the main library component. It consists of a "selector" and a preview.
export function Library({ project_id, onClose }: Props) {
  const current_path = useTypedRedux({ project_id }, "current_path");
  const library = useTypedRedux({ project_id }, "library");
  const library_selected = useTypedRedux({ project_id }, "library_selected");
  const library_is_copying = useTypedRedux(
    { project_id },
    "library_is_copying",
  );
  const library_search = useTypedRedux({ project_id }, "library_search");

  const project_map = useTypedRedux("projects", "project_map");

  const actions = useActions({ project_id });

  const [show_thumb, set_show_thumb] = useState<boolean>(false);

  const library_docs_sorted = useMemo<any>(() => {
    if (library == null) return;
    let docs = library?.getIn(["examples", "documents"]) as any;
    const metadata = library?.getIn(["examples", "metadata"]) as any;
    if (docs != null && library_search) {
      const search = search_split(library_search);
      // Using JSON of the doc is pretty naive but it's fast enough
      // and I don't want to spend much time on this!
      docs = docs.filter((doc) =>
        search_match(JSON.stringify(doc.toJS()).toLowerCase(), search),
      );
    }

    if (docs != null) {
      // sort by a triplet: idea is to have the docs sorted by their category,
      // where some categories have weights (e.g. "introduction" comes first, no matter what)
      const sortfn = function (doc) {
        return [
          metadata.getIn(["categories", doc.get("category"), "weight"]) || 0,
          metadata
            .getIn(["categories", doc.get("category"), "name"])
            .toLowerCase(),
          (doc.get("title") && doc.get("title").toLowerCase()) || doc.get("id"),
        ];
      };
      return docs.sortBy(sortfn);
    }
  }, [library, library_search]);

  function metadata() {
    return library?.getIn(["examples", "metadata"]) as any;
  }

  // The purpose is to prepare the target for the rsync operation.
  // So far, this works well for all directories -- marked by a "/" at the end.
  function target_path() {
    const doc = library_selected;
    if (doc == null) return;
    let src = doc.get("src");
    let subdir: string;
    if (doc.get("subdir")) {
      subdir = doc.get("subdir");
    } else {
      // directory? cut off the trailing slash
      if (src[src.length - 1] === "/") {
        src = src.slice(0, -1);
        // subdir in current path is the name of the directory
        subdir = path_split(src).tail;
      } else {
        // otherwise, we're about to copy over a single file → no subdirectory!
        subdir = "";
      }
    }
    const target = join(current_path, subdir);
    //if DEBUG then console.log("copy from", doc.src, "to", target)
    return target;
  }

  // This is the core part of all this: copy over the directory (TODO: a single file)
  // from the global read-only dir to the user's current directory
  function copy(doc) {
    doc = library_selected;
    if (doc == null || actions == null) return;
    actions.set_library_is_copying(true);
    track("library", {
      action: "copy",
      id: doc.get("id"),
      title: doc.get("title"),
    });
    actions.copy_from_library({
      src: doc.get("src"),
      target: target_path(),
      title: doc.get("title"),
      docid: doc.get("id"),
      start: doc.get("start") ?? "/",
      cb: () => {
        actions.set_library_is_copying(false);
        onClose?.();
      },
    });
  }

  function set_search(search) {
    actions?.setState({ library_search: search });
  }

  function select_list_click(doc) {
    // ignore selection of the very same entry
    if (doc.get("id") == library_selected?.get("id")) {
      return;
    }

    // we control the visibility of the thumbnail, because it would show to the
    // old one until the new one is loaded
    set_show_thumb(false);
    actions?.setState({ library_selected: doc });
  }

  function select_list(): JSX.Element[] | undefined {
    if (library_docs_sorted == null) {
      return;
    }

    const item_style: CSS = {
      width: "100%",
      margin: "2px 0px",
      padding: "5px",
      border: "none",
      textAlign: "left",
      cursor: "pointer",
    };

    const list: JSX.Element[] = [];
    let cur_cat: any = undefined;

    library_docs_sorted.map((doc) => {
      //new category? insert a header into the list ...
      if (doc.get("category") !== cur_cat) {
        cur_cat = doc.get("category");
        const cur_cat_title = metadata().getIn(["categories", cur_cat, "name"]);
        list.push(
          <li className="list-group-header" key={`header-${cur_cat}`}>
            {cur_cat_title}
          </li>,
        );
      }

      // the entry for each available document
      list.push(
        <List.Item
          key={doc.get("id")}
          onClick={() => select_list_click(doc)}
          style={{
            ...item_style,
            ...(doc.get("id") == library_selected?.get("id")
              ? { background: "#337ab7", color: "white" }
              : undefined),
          }}
        >
          {doc.get("title") ?? doc.get("id")}
        </List.Item>,
      );
    });
    return list;
  }

  function selector(): JSX.Element {
    const list_style = {
      maxHeight: HEIGHT,
      overflowX: "hidden",
      overflowY: "scroll",
      border: `1px solid ${COLORS.GRAY_LL}`,
      borderRadius: "5px",
      marginBottom: "0px",
      marginRight: "15px",
    } as CSS;

    return <List style={list_style}>{select_list()}</List>;
  }

  function thumbnail() {
    if (library_selected?.get("thumbnail") == null || !project_id) {
      return null;
    }

    const img_path = webapp_client.project_client.read_file({
      project_id,
      path: library_selected.get("thumbnail"),
    });

    const img_style: CSS = {
      display: show_thumb ? "block" : "none",
      maxHeight: "100%",
      maxWidth: "100%",
      border: `1px solid ${COLORS.GRAY_L}`,
      boxShadow: `2px 2px 1px ${COLORS.GRAY_LL}`,
      borderRadius: "5px",
    };

    return (
      <img
        src={img_path}
        style={img_style}
        onLoad={() => set_show_thumb(true)}
      />
    );
  }

  function copy_button() {
    return (
      <Button
        size="large"
        type="primary"
        onClick={copy}
        disabled={library_is_copying}
      >
        {library_is_copying ? (
          <span>
            <Loading text="Copying ..." />
          </span>
        ) : (
          <span>
            <Icon name="files" /> Get a Free Copy
          </span>
        )}
      </Button>
    );
  }

  function close_button() {
    if (onClose == null) {
      return;
    }
    return (
      <Button style={{ float: "right" }} onClick={onClose}>
        Close
      </Button>
    );
  }

  function details() {
    let info;
    if (library_selected == null || metadata() == null) {
      return;
    }
    // for doc and metadata examples see https://github.com/sagemathinc/cocalc-examples/blob/master/index.yaml
    const doc = library_selected;
    const style: CSS = {
      maxHeight: HEIGHT,
      overflow: "auto",
    };

    // this tells the user additional information for specific tags (like, pick the right kernel...)
    const tag_extra_info: any[] = [];
    for (const tag of doc.get("tags") ?? []) {
      info = metadata().getIn(["tags", tag, "info"]);
      if (info) {
        tag_extra_info.push(info);
      }
    }

    return (
      <div style={style}>
        <h5 style={{ marginTop: "0px" }}>
          <strong>{doc.get("title") ?? doc.get("id")}</strong>
          {doc.get("author") != null ? ` by ${doc.get("author")}` : undefined}
        </h5>
        {doc.get("description") != null ? (
          <p style={{ color: COLORS.GRAY_D }}>
            <Markdown value={doc.get("description")} />
          </p>
        ) : undefined}
        {(() => {
          if (doc.get("website") != null) {
            const website_style = {
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            } as CSS;
            return (
              <p style={{ color: COLORS.GRAY_D }}>
                Website:{" "}
                <a
                  style={website_style}
                  target="_blank"
                  rel="noopener"
                  href={doc.get("website")}
                >
                  {doc.get("website")}
                </a>
              </p>
            );
          }
        })()}
        {doc.get("license") != null ? (
          <p style={{ color: COLORS.GRAY_D }}>
            License:{" "}
            {metadata().getIn(["licenses", doc.get("license")]) ??
              doc.get("license")}
          </p>
        ) : undefined}
        {(() => {
          if (doc.get("tags") != null) {
            const tags = doc
              .get("tags")
              .map((t) => metadata().getIn(["tags", t, "name"]) ?? t);
            return (
              <p style={{ color: COLORS.GRAY_D }}>Tags: {tags.join(", ")}</p>
            );
          }
        })()}
        {(() => {
          if (tag_extra_info.length > 0) {
            info = tag_extra_info.join(" ");
            return (
              <p style={{ color: COLORS.GRAY_D }}>
                <Icon
                  name="exclamation-triangle"
                  style={{ color: COLORS.YELL_L }}
                />{" "}
                {info}
              </p>
            );
          }
        })()}
        {copy_button()}
      </div>
    );
  }

  function render_search() {
    return (
      <SearchInput
        autoFocus={true}
        autoSelect={true}
        placeholder="Search library..."
        value={library_search}
        on_change={(value) => set_search(value)}
        on_escape={() => set_search("")}
      />
    );
  }

  function render_main_content() {
    const thumb =
      library_selected != null ? library_selected.get("thumbnail") : undefined;
    return (
      <Row>
        <Col sm={24} style={{ marginBottom: "15px" }}>
          {render_search()}
        </Col>
        <Col sm={8}>{selector()}</Col>
        <Col sm={thumb ? 12 : 16}>{details()}</Col>
        {thumb ? <Col sm={4}>{thumbnail()}</Col> : undefined}
      </Row>
    );
  }

  let content;
  const project = project_map?.get(project_id);
  const state = project?.get("state")?.get("state");

  if (state && state !== "running") {
    content = <span>Project not running</span>;
  } else if (library?.get("examples") == null) {
    content = <Loading />;
  } else {
    content = render_main_content();
  }

  return (
    <Fragment>
      {content}
      {onClose != null && (
        <Row>
          <Col sm={24}>{close_button()}</Col>
        </Row>
      )}
    </Fragment>
  );
}
