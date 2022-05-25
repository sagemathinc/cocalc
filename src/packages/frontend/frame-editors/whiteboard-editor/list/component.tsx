import { useMemo } from "react";
import { Input } from "antd";
const { Search } = Input;
import { Virtuoso } from "react-virtuoso";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { useFrameContext } from "../hooks";
import { useEditorRedux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { State } from "../actions";
import RenderElement from "../elements/render";
import RenderReadOnlyElement from "../elements/render-static";
import { search_match, search_split } from "@cocalc/util/misc";
import { Element } from "../types";
import { fontSizeToZoom } from "../math";

export default function List() {
  const { actions, id: frameId, project_id, path, desc } = useFrameContext();
  const useEditor = useEditorRedux<State>({ project_id, path });
  const canvasScale = fontSizeToZoom(desc.get("font_size"));

  const isLoaded = useEditor("is_loaded");
  const readOnly = useEditor("read_only");
  const RenderElt = readOnly ? RenderReadOnlyElement : RenderElement;

  const elementsMap = useEditor("elements");
  const elements: undefined | Element[] = useMemo(() => {
    if (elementsMap == null) return undefined;

    let v = elementsMap
      .valueSeq()
      .filter((x) => x != null && x.get("type") != "edge")
      .toJS();

    const search = desc.get("search")?.toLowerCase().trim();
    if (search) {
      // filter by matches for the search string
      console.log("search", { search, v });
      const s = search_split(search);
      v = v.filter((x) => x.str && search_match(x.str.toLowerCase(), s));
      console.log("after ", { v });
    }

    v?.sort((elt1, elt2) => {
      if (elt1.y < elt2.y) return -1;
      if (elt1.y > elt2.y) return 1;
      if (elt1.x <= elt2.x) return -1;
      return 1;
    });
    return v;
  }, [elementsMap, desc.get("search")]);

  const virtuosoScroll = useVirtuosoScrollHook({
    cacheId: `whiteboard-list-${project_id}-${path}-${desc.get("id")}`,
  });

  if (!isLoaded) {
    return <Loading theme="medium" />;
  }

  return (
    <div className="smc-vfill">
      <Search
        placeholder="Search items..."
        style={{ width: "100%", padding: "10px 15px" }}
        defaultValue={desc.get("search")}
        onChange={(e) => {
          actions.setSearch(frameId, e.target.value);
        }}
      />
      <div
        style={{
          height: "100%",
        }}
      >
        <Virtuoso
          style={{
            width: `${100 / canvasScale}%`,
            height: `${100 / canvasScale + 1}%`,
            transform: `scale(${canvasScale})`,
            transformOrigin: "top left",
            marginBottom: "10px",
          }}
          totalCount={elements?.length ?? 0}
          itemContent={(index) => {
            const element = elements?.[index];
            if (element == null) {
              // this can't happen.
              return <div style={{ height: "1px" }}></div>;
            }
            return (
              <div
                style={{
                  height: `${(element.h ?? 0) + 10}px`,
                  margin: "5px 15px 5px 60px",
                  position: "relative",
                  padding: "5px",
                  border: "1px solid #eee",
                  overflowY: "hidden",
                }}
              >
                <RenderElt
                  element={element}
                  canvasScale={canvasScale}
                  readOnly={readOnly}
                />
              </div>
            );
          }}
          {...virtuosoScroll}
        />
      </div>
    </div>
  );
}
