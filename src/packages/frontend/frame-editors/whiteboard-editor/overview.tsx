/*

Shows an overview of all pages in the whiteboard in
a grid layout, where the size of pages is a function
of the "font_size" parameter for the frame.

*/

import { CSSProperties, ReactNode, useEffect } from "react";
import type { GridItemProps } from "react-virtuoso";
import { VirtuosoGrid } from "react-virtuoso";

import { useEditorRedux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { DEFAULT_FONT_SIZE } from "@cocalc/util/consts/ui";
import { State, elementsList } from "./actions";
import DeletePage from "./delete-page";
import { useFrameContext } from "./hooks";
import NewPage, { AddPage } from "./new-page";
import { Overview as OnePage } from "./tools/navigation";

export default function Overview() {
  const { actions, id: frameId, project_id, path, desc } = useFrameContext();
  const useEditor = useEditorRedux<State>({ project_id, path });
  const size = 15 * (desc?.get("font_size") ?? DEFAULT_FONT_SIZE);
  const isLoaded = useEditor("is_loaded");
  const pagesMap = useEditor("pages");
  const elementsMap = useEditor("elements");
  const pages = Math.max(1, pagesMap?.size ?? 1);
  const sortedPageIds = useEditor("sortedPageIds");

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
  } as CSSProperties;

  const ItemContainer: React.FC<GridItemProps & { children?: ReactNode }> = ({
    children,
  }) => (
    <div
      style={{
        display: "inline-block",
        width: size + 35,
        height: (9 / 16) * size + 30,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", margin: "5px 0" }}>{children}</div>
    </div>
  );

  const itemContent = (index) => {
    if (index > pages) {
      // should never happen
      return <div style={{ height: "10px" }} />;
    }
    const width = size;
    const height = (size * 9) / 16;

    if (index == pages) {
      // Add a new page
      return (
        <NewPage
          style={{
            textAlign: "center",
            width,
            height,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          tip={
            <>
              Click to create a page. Switch between pages by clicking on any
              page here. You can drag pages to reorder them in the{" "}
              <a
                onClick={() => {
                  actions.show_focused_frame_of_type("pages", "col", true, 0.2);
                }}
              >
                pages frame
              </a>
              .
            </>
          }
        />
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
            actions.mainFrameType,
          );
          actions.setPage(frameId, index + 1);
          actions.fitToScreen(frameId);
          // We have to do this again after the click is done,
          // since the click focuses the pages frame again.
          setTimeout(() => actions.set_active_id(frameId), 0);
        }}
        style={STYLE}
      >
        <div style={{ display: "flex", position: "relative" }}>
          <OnePage
            margin={15}
            elements={elementsOnPage ?? []}
            elementsMap={elementsMap}
            width={width}
            height={height}
            navMap={"page"}
            style={{
              pointerEvents: "none",
              background: "white",
              border: "1px solid #ccc",
              borderRadius: "5px",
            }}
            maxScale={2}
            presentation={actions.mainFrameType == "slides"}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <DeletePage pageId={`${sortedPageIds.get(index)}`} />
              <AddPage pageId={`${sortedPageIds.get(index)}`} />
            </div>
          </div>
        </div>
        <div
          style={{
            fontSize: "11pt",
            padding: "5px",
          }}
        >
          {index + 1}
        </div>
      </div>
    );
  };

  return (
    <div
      className="smc-vfill"
      style={{
        background: "#eee",
        padding: "0 0 2px 10px" /* bottom padding also stops bouncing */,
      }}
    >
      <VirtuosoGrid
        overscan={500}
        style={{
          width: "100%",
          height: "100%",
        }}
        components={{
          Item: ItemContainer,
        }}
        totalCount={pages + 1}
        itemContent={itemContent}
      />
    </div>
  );
}
