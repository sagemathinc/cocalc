import { useEffect, useMemo } from "react";
import { Input } from "antd";
import StatefulVirtuoso from "@cocalc/frontend/components/stateful-virtuoso";
import { useFrameContext } from "./hooks";
import { useEditorRedux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { State } from "./actions";
import RenderElement from "./elements/render";
import RenderReadOnlyElement from "./elements/render-static";
import { Element } from "./types";
import { fontSizeToZoom } from "./math";
import { debounce } from "lodash";
import sortedElements from "./sorted-elements";

export default function Search() {
  const { actions, id: frameId, project_id, path, desc } = useFrameContext();
  const useEditor = useEditorRedux<State>({ project_id, path });
  const canvasScale = fontSizeToZoom(desc.get("font_size"));

  const isLoaded = useEditor("is_loaded");
  const readOnly = useEditor("read_only");
  const sortedPageIds = useEditor("sortedPageIds");
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
    const search = desc.get("search")?.toLowerCase().trim();
    return sortedElements(elementsMap, sortedPageIds, search);
  }, [elementsMap, desc.get("search")]);

  if (!isLoaded) {
    return <Loading theme="medium" />;
  }

  return (
    <div className="smc-vfill">
      <Input.Search
        allowClear
        placeholder="Search  (use /re/ for regexp)..."
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
        <StatefulVirtuoso
          style={{
            marginBottom: "10px",
          }}
          cacheId={`whiteboard-search-${project_id}-${path}-${desc.get("id")}`}
          increaseViewportBy={500}
          totalCount={(elements?.length ?? 0) + 1}
          initialTopMostItemIndex={0}
          itemContent={(index) => {
            if (index >= (elements?.length ?? 0)) {
              // extra space to not feel cramped.
              return <div style={{ height: `${50 / canvasScale}px` }}></div>;
            }
            const element = elements?.[index];
            if (element == null) {
              // this can't happen.
              return <div style={{ height: "1px" }}></div>;
            }
            return (
              <div
                style={{
                  height: `${((element.h ?? 0) + 20) * canvasScale}px`,
                  margin: "5px",
                  overflow: "hidden",
                }}
              >
                <div
                  onClick={() => {
                    const frameId = actions.show_focused_frame_of_type(
                      actions.mainFrameType
                    );
                    if (frameId) {
                      actions.scrollElementIntoView(element.id, frameId, "top");
                    }
                  }}
                  style={{
                    transform: `scale(${canvasScale})`,
                    transformOrigin: "top left",
                    cursor: "pointer",
                    position: "relative",
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
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}
