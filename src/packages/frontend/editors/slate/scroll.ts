import { delay } from "awaiting";
import type { SlateEditor } from "./editable-markdown";

export interface ScrollState {
  index: number;
  offset: number;
}

export function getScrollState(editor: SlateEditor): ScrollState | undefined {
  const startIndex = editor.windowedListRef.current?.visibleRange?.startIndex;
  if (startIndex == null) return;
  const endIndex = editor.windowedListRef.current?.visibleRange?.endIndex;
  if (endIndex == null) return;

  let index, offset;
  if (endIndex > startIndex) {
    index = startIndex + 1;
    offset = editor.windowedListRef.current?.secondItemOffset ?? 0;
  } else {
    index = startIndex;
    offset = editor.windowedListRef.current?.firstItemOffset ?? 0;
  }

  return { index, offset };
}

export async function setScrollState(editor: SlateEditor, scroll: ScrollState) {
  const { index, offset } = scroll;
  const f = async () => {
    editor.windowedListRef.current?.virtuosoRef.current?.scrollToIndex?.(index);
    // We have to set this twice, or it sometimes doesn't work.  Setting it twice
    // flickers a lot less than.   This might be a bug in virtuoso.  Also, we
    // have to first set it above without the offset, then set it with!. Weird.
    await new Promise(requestAnimationFrame);
    editor.windowedListRef.current?.virtuosoRef.current?.scrollToIndex?.({
      index,
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
