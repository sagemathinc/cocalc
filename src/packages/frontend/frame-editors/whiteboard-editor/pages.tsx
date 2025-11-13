/*
Shows vertical linear sortable list of the pages in the whiteboard,
where the page size expands to fit the width.
*/

import { CSSProperties, useEffect, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import useResizeObserver from "use-resize-observer";

import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { useFrameContext } from "./hooks";
import { useEditorRedux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { Overview } from "./tools/navigation";
import { State, elementsList } from "./actions";
import {
  DragHandle,
  SortableList,
  SortableItem,
} from "@cocalc/frontend/components/sortable-list";
import NewPage, { AddPage } from "./new-page";
import DeletePage from "./delete-page";

const VMARGIN = 20;
const HMARGIN = 0;

export default function Pages() {
  const { actions, id: frameId, project_id, path, desc } = useFrameContext();
  const useEditor = useEditorRedux<State>({ project_id, path });
  const [height, setHeight] = useState<number>(200);
  const [width, setWidth] = useState<number>(200);

  const isLoaded = useEditor("is_loaded");
  const pagesMap = useEditor("pages");
  const elementsMap = useEditor("elements");
  const pages = Math.max(1, pagesMap?.size ?? 1);
  const sortedPageIds = useEditor("sortedPageIds");

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
    width: `${width - 2 * HMARGIN}px`,
    padding: `${VMARGIN}px 10px`,
    position: "relative",
    overflow: "hidden",
  } as CSSProperties;

  const itemContent = (index) => {
    if (index == pages) {
      // Add a new page
      return (
        <NewPage
          style={STYLE}
          tip={
            "Click to create a new page.  You can also switch between pages by clicking on a page here, and drag and drop to reorder the pages."
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
            actions.mainFrameType
          );
          actions.setPage(frameId, index + 1);
          actions.fitToScreen(frameId);
          // We have to do this again after the click is done,
          // since the click focuses the pages frame again.
          setTimeout(() => actions.set_active_id(frameId), 0);
        }}
        style={{ ...STYLE }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            position: "relative",
          }}
        >
          <div
            style={{
              fontSize: `${index >= 999 ? 8 : index >= 99 ? 10 : 12}pt`,
              position: "absolute",
              textAlign: "right",
              left: -7.5,
              top: 0,
              width: "22.5px", // enough to easily do up to 4 digit numbers with font above...
            }}
          >
            {index + 1}
          </div>
          <DragHandle
            id={`${sortedPageIds.get(index)}`}
            style={{ marginRight: "5px", color: "#999" }}
          />
          <Overview
            margin={15}
            elements={elementsOnPage ?? []}
            elementsMap={elementsMap}
            width={
              width -
              70 /* that 70 accounts for the margin/padding/buttons; without this page gets cut off on right*/
            }
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
          <div style={{ display: "flex", flexDirection: "column" }}>
            <DeletePage pageId={`${sortedPageIds.get(index)}`} />
            <AddPage pageId={`${sortedPageIds.get(index)}`} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="smc-vfill" ref={divRef} style={{ background: "#eee" }}>
      <SortableList
        items={sortedPageIds.toJS()}
        Item={({ id }) => {
          return itemContent(sortedPageIds.indexOf(id));
        }}
        onDragStop={(oldIndex, newIndex) => {
          if (oldIndex == newIndex) return;
          actions.movePage(oldIndex, newIndex);
          const frameId = actions.show_focused_frame_of_type(
            actions.mainFrameType
          );
          actions.setPage(frameId, newIndex + 1);
        }}
      >
        <Virtuoso
          style={{
            width: "100%",
            height: "100%",
            marginBottom: "10px",
          }}
          totalCount={pages + 1}
          increaseViewportBy={1.5 * height}
          itemContent={(index) => {
            return (
              <SortableItem id={sortedPageIds.get(index) ?? index}>
                {itemContent(index)}
              </SortableItem>
            );
          }}
          {...virtuosoScroll}
        />
      </SortableList>
    </div>
  );
}
