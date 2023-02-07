/*

Shows an overview of all pages in the whiteboard in
a grid layout, where the size of pages is a function
of the "font_size" parameter for the frame.

*/

import { Button, Popover } from "antd";
import { CSSProperties, useEffect, ReactNode } from "react";
import { VirtuosoGrid } from "react-virtuoso";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { useFrameContext } from "./hooks";
import { useEditorRedux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { Overview as OnePage } from "./tools/navigation";
import { State, elementsList } from "./actions";
import { Icon } from "@cocalc/frontend/components/icon";
import type { GridItemProps } from "react-virtuoso";

export default function Overview() {
  const { actions, id: frameId, project_id, path, desc } = useFrameContext();
  const useEditor = useEditorRedux<State>({ project_id, path });
  const size = 12 * (desc?.get("font_size") ?? 14);

  const isLoaded = useEditor("is_loaded");
  const pagesMap = useEditor("pages");
  const elementsMap = useEditor("elements");
  const pages = Math.max(1, pagesMap?.size ?? 1);
  const sortedPageIds = useEditor("sortedPageIds");

  const virtuosoScroll = useVirtuosoScrollHook({
    cacheId: `whiteboard-pages-${project_id}-${path}-${desc.get("id")}`,
  });

  useEffect(() => {
    // ensure we don't have viewport info left over from a split...
    if (desc.get("viewport") != null) {
      actions.saveViewport(frameId, null);
    }
    if (desc.get("pages") != null) {
      // do NOT want info about current page or pages to come
      // from desc.
      actions.setPages(frameId, null);
    }
  }, [desc]);

  if (!isLoaded || sortedPageIds == null || pagesMap == null) {
    return <Loading theme="medium" />;
  }

  const STYLE = {
    cursor: "pointer",
    width: `${size}px`,
    margin: "5px",
    position: "relative",
    overflow: "hidden",
  } as CSSProperties;

  const ItemContainer: React.FC<GridItemProps & { children?: ReactNode }> = ({
    children,
  }) => (
    <div
      style={{
        display: "inline-block",
        width: size,
        height: (9 / 16) * size,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );

  const itemContent = (index) => {
    if (index == pages) {
      // Add a new page
      return (
        <div style={{ ...STYLE, textAlign: "center" }}>
          <Popover
            title={"Create a new page"}
            content={
              <div style={{ maxWidth: "400px" }}>
                Each page is an independent infinite whiteboard canvas. Click
                this button to create a new page. Easily jump between pages by
                clicking on a page here.
              </div>
            }
          >
            <Button
              shape="round"
              size="large"
              onClick={() => {
                const id = actions.show_focused_frame_of_type(
                  actions.mainFrameType
                );
                actions.newPage(id);
                setTimeout(() => {
                  // after the click
                  actions.show_focused_frame_of_type(actions.mainFrameType);
                }, 0);
              }}
            >
              <Icon name="plus-circle" /> New
            </Button>
          </Popover>
        </div>
      );
    }
    const pageId = sortedPageIds?.get(index) ?? "";
    if (pagesMap == null) {
      return <div style={{ height: "1px" }}></div>;
    }
    const thisPage = pagesMap.get(pageId);
    const elementsOnPage = thisPage ? elementsList(thisPage) : [];
    return (
      <div
        onClick={(e) => {
          e.stopPropagation(); // so doesn't focus this frame then page, causing flicker.
          const frameId = actions.show_focused_frame_of_type(
            actions.mainFrameType
          );
          actions.setPage(frameId, index + 1);
          actions.fitToScreen(frameId);
          // We have to do this again after the click is done,
          // since the click focuses the pages frame again.
          setTimeout(() => actions.set_active_id(frameId), 0);
        }}
        style={STYLE}
      >
        <OnePage
          margin={15}
          elements={elementsOnPage ?? []}
          elementsMap={elementsMap}
          width={size}
          height={(size * 9) / 16}
          navMap={"page"}
          style={{
            pointerEvents: "none",
            background: "white",
            border: "1px solid #ccc",
            borderRadius: "5px",
          }}
          maxScale={2}
        />
        <div
          style={{
            textAlign: "center",
            fontSize: "10pt",
          }}
        >
          {index + 1}
        </div>
      </div>
    );
  };

  return (
    <div className="smc-vfill" style={{ background: "#eee" }}>
      <VirtuosoGrid
        style={{
          width: "100%",
          height: "100%",
          marginBottom: "10px",
        }}
        components={{
          Item: ItemContainer,
        }}
        totalCount={pages + 1}
        itemContent={itemContent}
        {...virtuosoScroll}
      />
    </div>
  );
}
