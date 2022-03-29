import { delay } from "awaiting";
import type { SlateEditor } from "./editable-markdown";

export interface ScrollState {
  startIndex: number;
  offset: number;
}

export function getScrollState(editor: SlateEditor): ScrollState | undefined {
  const startIndex = editor.windowedListRef.current?.visibleRange?.startIndex;
  if (startIndex == null) return;

  const scroller = editor.windowedListRef.current?.scroller;
  if (scroller == null) return;

  if (editor.windowedListRef.current?.virtuosoRef.current == null) return;
  const offset =
    (scroller.scrollTop ?? 0) -
    (editor.windowedListRef.current?.firstItemOffset ?? 0);

  return { startIndex, offset };
}

export async function setScrollState(editor: SlateEditor, scroll: ScrollState) {
  const { startIndex, offset } = scroll;
  const f = async () => {
    editor.windowedListRef.current?.virtuosoRef.current?.scrollToIndex?.(
      startIndex
    );
    // We have to set this twice, or it sometimes doesn't work.  Setting it twice
    // flickers a lot less than.   This might be a bug in virtuoso.  Also, we
    // have to first set it above without the offset, then set it with!. Weird.
    await new Promise(requestAnimationFrame);
    editor.windowedListRef.current?.virtuosoRef.current?.scrollToIndex?.({
      index: startIndex,
      offset,
    });
  };

  // Do it once:
  await f();
  // Then wait until next loop and try again.
  // This combination seems pretty effective.
  await delay(0);
  await f();
}
