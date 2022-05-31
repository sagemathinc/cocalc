/* Shows an overview of all pages in the whiteboard */

import { CSSProperties, useEffect, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { useFrameContext, usePageInfo } from "./hooks";
import { useEditorRedux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { Overview } from "./tools/navigation";
import { State, elementsList } from "./actions";
import { Icon } from "@cocalc/frontend/components/icon";
import useResizeObserver from "use-resize-observer";

const VMARGIN = 8;
const HMARGIN = 15;

export default function Pages() {
  const { actions, id: frameId, project_id, path, desc } = useFrameContext();
  const useEditor = useEditorRedux<State>({ project_id, path });
  const [height, setHeight] = useState<number>(200);
  const [width, setWidth] = useState<number>(200);

  const isLoaded = useEditor("is_loaded");
  //const readOnly = useEditor("read_only");
  const pagesMap = useEditor("pages");
  usePageInfo(pagesMap);
  const elementsMap = useEditor("elements");

  const virtuosoScroll = useVirtuosoScrollHook({
    cacheId: `whiteboard-pages-${project_id}-${path}-${desc.get("id")}`,
  });

  const divRef = useRef<any>(null);
  const resize = useResizeObserver({ ref: divRef });
  useEffect(() => {
    const elt = divRef.current;
    if (elt == null) return;
    const w = elt.getBoundingClientRect().width;
    setWidth(w);
    setHeight(w);
  }, [resize]);

  useEffect(() => {
    // ensure we don't have viewport info left over from a split...
    if (desc.get("viewport") != null) {
      actions.saveViewport(frameId, null);
    }
  }, [desc]);

  if (!isLoaded) {
    return <Loading theme="medium" />;
  }

  const pages = desc.get("pages") ?? 1;

  const STYLE = {
    cursor: "pointer",
    width: `${width - 3 * HMARGIN}px`,
    height: `${height}px`,
    margin: `${VMARGIN}px ${2 * HMARGIN}px ${VMARGIN}px ${HMARGIN}px`,
    position: "relative",
    overflow: "hidden",
    background: "white",
  } as CSSProperties;

  return (
    <div
      className="smc-vfill"
      ref={divRef}
      style={{ background: "rgb(82, 86, 89)" }}
    >
      <Virtuoso
        style={{
          width: "100%",
          height: "100%",
          marginBottom: "10px",
        }}
        totalCount={pages + 2}
        increaseViewportBy={1.5 * height}
        itemContent={(index) => {
          if (index == (pages ?? 1)) {
            // Add a new page
            return (
              <div
                style={{
                  ...STYLE,
                  textAlign: "center",
                  color: "#888",
                }}
                onClick={() => {
                  const id = actions.show_focused_frame_of_type("whiteboard");
                  actions.newPage(id);
                  setTimeout(() => {
                    // after the click
                    actions.show_focused_frame_of_type("whiteboard");
                  }, 0);
                }}
              >
                <div style={{ fontSize: `${width / 3}px` }}>
                  <Icon name="plus-circle" />
                </div>
                <div style={{ fontSize: "20px" }}>New Page</div>
              </div>
            );
          } else if (index == pages + 1) {
            // extra breathing room
            return <div style={{ height: `${height}px` }}></div>;
          }
          const elementsOnPage = elementsList(pagesMap?.get(index + 1)) ?? [];
          if (elementsOnPage == null) {
            return <div style={{ height: "1px" }}></div>;
          }
          return (
            <div
              onClick={() => {
                const id = actions.show_focused_frame_of_type("whiteboard");
                actions.setPage(id, index + 1);
                actions.fitToScreen(id);
              }}
              style={{ ...STYLE }}
            >
              <div
                style={{
                  textAlign: "center",
                  background: "rgb(82, 86, 89)",
                  color: "white",
                  fontSize: "10px",
                }}
              >
                Page {index + 1}
              </div>
              <Overview
                margin={50}
                elements={elementsOnPage}
                elementsMap={elementsMap}
                width={width}
                height={height}
                navMap={"map"}
                style={{ pointerEvents: "none" }}
              />
            </div>
          );
        }}
        {...virtuosoScroll}
      />
    </div>
  );
}
