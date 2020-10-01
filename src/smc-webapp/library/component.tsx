/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join } from "path";

import { path_split, search_match, search_split } from "smc-util/misc";
import { COLORS } from "smc-util/theme";

declare var $: any;

import {
  useActions,
  useMemo,
  useRef,
  useState,
  useTypedRedux,
  CSS,
  React,
  ReactDOM,
  Fragment,
} from "../app-framework";

import { Col, Row, Button, ListGroup, ListGroupItem } from "react-bootstrap";

import { Markdown, Icon, Loading, SearchInput } from "../r_misc";
import { webapp_client } from "../webapp-client";

// used for some styles
const HEIGHT = "275px";

interface Props {
  project_id: string;
  onClose?: () => void;
}

// This is the main library component. It consists of a "selector" and a preview.
export const Library: React.FC<Props> = ({ project_id, onClose }) => {
  const current_path = useTypedRedux({ project_id }, "current_path");
  const library = useTypedRedux({ project_id }, "library");
  const library_selected = useTypedRedux({ project_id }, "library_selected");
  const library_is_copying = useTypedRedux(
    { project_id },
    "library_is_copying"
  );
  const library_search = useTypedRedux({ project_id }, "library_search");

  const project_map = useTypedRedux("projects", "project_map");

  const actions = useActions({ project_id });
  const selector_list_ref = useRef(null);

  const [show_thumb, set_show_thumb] = useState<boolean>(false);

  const library_docs_sorted = useMemo<any>(() => {
    if (library == null) return;
    let docs = library?.getIn(["examples", "documents"]);
    const metadata = library?.getIn(["examples", "metadata"]);
    if (docs != null && library_search) {
      const search = search_split(library_search);
      // Using JSON of the doc is pretty naive but it's fast enough
      // and I don't want to spend much time on this!
      docs = docs.filter((doc) =>
        search_match(JSON.stringify(doc.toJS()).toLowerCase(), search)
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
    return library?.getIn(["examples", "metadata"]);
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

  function selector_keyup(evt) {
    let dx;
    switch (evt.keyCode) {
      case 38: // up
        dx = -1;
        break;
      case 40: // down
        dx = 1;
        break;
    }
    move_cursor(dx);
    evt.preventDefault();
    evt.stopPropagation();
    evt.nativeEvent.stopImmediatePropagation();
    return false;
  }

  function move_cursor(dx) {
    if (library_docs_sorted == null || actions == null) return;
    let new_doc;
    if (library_selected == null) {
      new_doc = library_docs_sorted.get(0);
    } else {
      const ids = library_docs_sorted.map((doc) => doc.get("id"));
      const idx = ids.indexOf(library_selected.get("id")) + dx;
      new_doc = library_docs_sorted.get(idx % library_docs_sorted.size);
    }
    actions.setState({ library_selected: new_doc });
    $(ReactDOM.findDOMNode(selector_list_ref.current))
      .find(".active")
      .scrollintoview();
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
          </li>
        );
      }

      // the entry for each available document
      list.push(
        <ListGroupItem
          key={doc.get("id")}
          active={doc.get("id") == library_selected?.get("id")}
          onClick={() => select_list_click(doc)}
          style={item_style}
          bsSize={"small"}
        >
          {doc.get("title") ?? doc.get("id")}
        </ListGroupItem>
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
    } as CSS;

    return (
      <ListGroup
        style={list_style}
        onKeyUp={selector_keyup}
        ref={selector_list_ref}
      >
        {select_list()}
      </ListGroup>
    );
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
      <Button bsStyle="success" onClick={copy} disabled={library_is_copying}>
        {library_is_copying ? (
          <span>
            <Loading text="Copying ..." />
          </span>
        ) : (
          <span>
            <Icon name="files-o" /> Get a Copy
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
      <Button className={"pull-right"} onClick={onClose}>
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
        on_up={() => move_cursor(-1)}
        on_down={() => move_cursor(1)}
      />
    );
  }

  function render_main_content() {
    const thumb =
      library_selected != null ? library_selected.get("thumbnail") : undefined;
    return (
      <Row>
        <Col sm={12}>{render_search()}</Col>
        <Col sm={4}>{selector()}</Col>
        <Col sm={thumb ? 6 : 8}>{details()}</Col>
        {thumb ? <Col sm={2}>{thumbnail()}</Col> : undefined}
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
          <Col sm={12}>{close_button()}</Col>
        </Row>
      )}
    </Fragment>
  );
};
