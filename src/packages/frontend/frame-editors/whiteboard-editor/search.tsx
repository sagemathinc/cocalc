import { useEffect, useMemo } from "react";
import { Input } from "antd";
import { Virtuoso } from "react-virtuoso";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { useFrameContext } from "./hooks";
import { useEditorRedux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { State } from "./actions";
import RenderElement from "./elements/render";
import RenderReadOnlyElement from "./elements/render-static";
import { search_match, search_split } from "@cocalc/util/misc";
import { Element } from "./types";
import { fontSizeToZoom } from "./math";
import { debounce } from "lodash";

export default function Search() {
  const { actions, id: frameId, project_id, path, desc } = useFrameContext();
  const useEditor = useEditorRedux<State>({ project_id, path });
  const canvasScale = fontSizeToZoom(desc.get("font_size"));

  const isLoaded = useEditor("is_loaded");
  const readOnly = useEditor("read_only");
  const RenderElt = readOnly ? RenderReadOnlyElement : RenderElement;

  useEffect(() => {
    // ensure we don't have page info about search yet; otherwise,
    // splitting frame can have left over page state, hence show page
    // selector in title bar.  That said, we will likely support page
    // state info here at some point.
    if (desc.get("pages") != null) {
      actions.setPages(frameId, null);
    }
  }, [desc]);

  const elementsMap = useEditor("elements");
  const elements: undefined | Element[] = useMemo(() => {
    if (elementsMap == null) return undefined;

    // We only include elements with a str attribute for now,
    // e.g., notes, code, text.  If change to use more, need
    // to filter type to note be "edge".
    let v = elementsMap
      .valueSeq()
      .filter((x) => x != null && x.get("str"))
      .toJS();

    const search = desc.get("search")?.toLowerCase().trim();
    if (search) {
      // filter by matches for the str attribute for now.
      const s = search_split(search);
      v = v.filter((x) => x.str && search_match(x.str.toLowerCase(), s));
    }

    v?.sort((elt1, elt2) => {
      if ((elt1.page ?? 1) < (elt2.page ?? 1)) return -1;
      if ((elt1.page ?? 1) > (elt2.page ?? 1)) return 1;
      if (elt1.y < elt2.y) return -1;
      if (elt1.y > elt2.y) return 1;
      if (elt1.x <= elt2.x) return -1;
      return 1;
    });
    return v;
  }, [elementsMap, desc.get("search")]);

  const virtuosoScroll = useVirtuosoScrollHook({
    cacheId: `whiteboard-search-${project_id}-${path}-${desc.get("id")}`,
  });

  if (!isLoaded) {
    return <Loading theme="medium" />;
  }

  return (
    <div className="smc-vfill">
      <Input.Search
        allowClear
        placeholder="Search..."
        style={{ width: "100%", padding: "10px 15px" }}
        defaultValue={desc.get("search")}
        onChange={debounce((e) => {
          actions.setSearch(frameId, e.target.value);
        }, 250)}
      />
      <div
        style={{
          height: "100%",
        }}
      >
        <Virtuoso
          style={{
            width: `${100 / canvasScale}%`,
            height: `${100 / canvasScale}%`,
            transform: `scale(${canvasScale})`,
            transformOrigin: "top left",
            marginBottom: "10px",
          }}
          increaseViewportBy={500}
          totalCount={(elements?.length ?? 0) + 1}
          itemContent={(index) => {
            if (index >= (elements?.length ?? 0)) {
              // extra space to not feel cramped.
              return <div style={{ height: "100px" }}></div>;
            }
            const element = elements?.[index];
            if (element == null) {
              // this can't happen.
              return <div style={{ height: "1px" }}></div>;
            }
            return (
              <div
                onClick={() => {
                  actions.centerElement(element.id);
                }}
                style={{
                  cursor: "pointer",
                  height: `${(element.h ?? 0) + 20}px`,
                  margin: "5px 15px",
                  position: "relative",
                  padding: "5px",
                  border: "1px solid #eee",
                  overflow: "hidden",
                  width: `${(element.w ?? 0) + 5}px`,
                }}
              >
                <div style={{ pointerEvents: "none" }}>
                  <RenderElt
                    element={element}
                    canvasScale={canvasScale}
                    readOnly={readOnly}
                  />
                </div>
              </div>
            );
          }}
          {...virtuosoScroll}
        />
      </div>
    </div>
  );
}
