import React from "react";
import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import {
  Editor,
  Element,
  NodeEntry,
  Node,
  Range,
  Text,
  Transforms,
  Path,
} from "slate";
import Children from "./children";
import { WindowingParams } from "./children";
import Hotkeys from "../utils/hotkeys";
import { IS_FIREFOX, IS_SAFARI, IS_CHROME_LEGACY } from "../utils/environment";
import { ReactEditor } from "..";
import { ReadOnlyContext } from "../hooks/use-read-only";
import { useSlate } from "../hooks/use-slate";
import { useIsomorphicLayoutEffect } from "../hooks/use-isomorphic-layout-effect";
import { DecorateContext } from "../hooks/use-decorate";
import {
  DOMElement,
  isDOMElement,
  isDOMNode,
  DOMStaticRange,
  isPlainTextOnlyPaste,
} from "../utils/dom";
import {
  EDITOR_TO_ELEMENT,
  ELEMENT_TO_NODE,
  IS_READ_ONLY,
  NODE_TO_ELEMENT,
  IS_FOCUSED,
  PLACEHOLDER_SYMBOL,
} from "../utils/weak-maps";
import { debounce } from "lodash";
import getDirection from "direction";
import { useDOMSelectionChange, useUpdateDOMSelection } from "./selection-sync";
import { hasEditableTarget, hasTarget } from "./dom-utils";

// COMPAT: Edge Legacy don't support the `beforeinput` event
// Chrome Legacy doesn't support `beforeinput` correctly
const HAS_BEFORE_INPUT_SUPPORT =
  !IS_CHROME_LEGACY &&
  globalThis.InputEvent &&
  // @ts-ignore The `getTargetRanges` property isn't recognized.
  typeof globalThis.InputEvent.prototype.getTargetRanges === "function";

/**
 * `RenderElementProps` are passed to the `renderElement` handler.
 */

export interface RenderElementProps {
  children: any;
  element: Element;
  attributes: {
    "data-slate-node": "element";
    "data-slate-inline"?: true;
    "data-slate-void"?: true;
    dir?: "rtl";
    ref: any;
  };
}
export const RenderElementProps = null; // webpack + TS es2020 modules need this

/**
 * `RenderLeafProps` are passed to the `renderLeaf` handler.
 */

export interface RenderLeafProps {
  children: any;
  leaf: Text;
  text: Text;
  attributes: {
    "data-slate-leaf": true;
  };
}
export const RenderLeafProps = null; // webpack + TS es2020 modules need this

/**
 * `EditableProps` are passed to the `<Editable>` component.
 */

export type EditableProps = {
  decorate?: (entry: NodeEntry) => Range[];
  onDOMBeforeInput?: (event: Event) => void;
  placeholder?: string;
  readOnly?: boolean;
  role?: string;
  style?: React.CSSProperties;
  renderElement?: React.FC<RenderElementProps>;
  renderLeaf?: React.FC<RenderLeafProps>;
  as?: React.ElementType;
  windowing?: WindowingParams;
  divref?;
} & React.TextareaHTMLAttributes<HTMLDivElement>;

/**
 * Editable.
 */

export const Editable: React.FC<EditableProps> = (props: EditableProps) => {
  const {
    windowing,
    autoFocus,
    decorate = defaultDecorate,
    onDOMBeforeInput: propsOnDOMBeforeInput,
    placeholder,
    readOnly = false,
    renderElement,
    renderLeaf,
    style = {},
    as: Component = "div",
    ...attributes
  } = props;
  const editor = useSlate();
  const ref = props.divref ?? useRef<HTMLDivElement>(null);

  // Return true if the given event should be handled
  // by the event handler code defined below.
  const shouldHandle = useCallback(
    ({
      event, // the event itself
      name, // name of the event, e.g., "onClick"
      notReadOnly, // require doc to not be readOnly (ignored if not specified)
      editableTarget, // require event target to be editable (defaults to true if not specified!)
    }: {
      event;
      name: string;
      notReadOnly?: boolean;
      editableTarget?: boolean;
    }) =>
      (notReadOnly == null || notReadOnly == !readOnly) &&
      ((editableTarget ?? true) == true
        ? hasEditableTarget(editor, event.target)
        : hasTarget(editor, event.target)) &&
      !isEventHandled(event, attributes[name]),
    [editor, attributes, readOnly]
  );

  // Update internal state on each render.
  IS_READ_ONLY.set(editor, readOnly);

  // Keep track of some state for the event handler logic.
  const state: {
    isComposing: boolean;
    latestElement: DOMElement | null;
    shiftKey: boolean;
  } = useMemo(
    () => ({
      isComposing: false,
      latestElement: null as DOMElement | null,
      shiftKey: false,
    }),
    []
  );

  // state whose change causes an update
  const [hiddenChildren, setHiddenChildren] = useState<Set<number>>(
    new Set([])
  );

  editor.updateHiddenChildren = useCallback(() => {
    if (!ReactEditor.isUsingWindowing(editor)) return;
    const hiddenChildren0: number[] = [];
    let isCollapsed: boolean = false;
    let level: number = 0;
    let index: number = 0;
    let hasAll: boolean = true;
    for (const child of editor.children) {
      if (!Element.isElement(child)) {
        throw Error("bug");
      }
      if (child.type != "heading" || (isCollapsed && child.level > level)) {
        if (isCollapsed) {
          hiddenChildren0.push(index);
          if (hasAll && !hiddenChildren.has(index)) {
            hasAll = false;
          }
        }
      } else {
        // it's a heading of a high enough level, and it sets the new state.
        // It is always visible.
        isCollapsed = !!editor.collapsedSections.get(child);
        level = child.level;
      }
      index += 1;
    }
    if (hasAll && hiddenChildren0.length == hiddenChildren.size) {
      // no actual change (since subset and same cardinality), so don't
      // cause re-render.
      return;
    }
    setHiddenChildren(new Set(hiddenChildren0));
  }, [editor.children, hiddenChildren]);

  const updateHiddenChildrenDebounce = useMemo(() => {
    return debounce(() => editor.updateHiddenChildren(), 1000);
  }, []);

  // When the actual document changes we soon update the
  // hidden children set, since it is a list of indexes
  // into editor.children, so may change.  That said, we
  // don't want this to impact performance when typing, so
  // we debounce it, and it is unlikely that things change
  // when the content (but not number) of children changes.
  useEffect(updateHiddenChildrenDebounce, [editor.children]);
  // We *always* immediately update when the number of children changes, since
  // that is highly likely to make the hiddenChildren data structure wrong.
  useEffect(() => editor.updateHiddenChildren(), [editor.children.length]);

  // Update element-related weak maps with the DOM element ref.
  useIsomorphicLayoutEffect(() => {
    if (ref.current) {
      EDITOR_TO_ELEMENT.set(editor, ref.current);
      NODE_TO_ELEMENT.set(editor, ref.current);
      ELEMENT_TO_NODE.set(ref.current, editor);
    } else {
      NODE_TO_ELEMENT.delete(editor);
    }
  });

  // The autoFocus TextareaHTMLAttribute doesn't do anything on a div, so it
  // needs to be manually focused.
  useEffect(() => {
    if (ref.current && autoFocus) {
      ref.current.focus();
    }
  }, [autoFocus]);

  useIsomorphicLayoutEffect(() => {
    // Whenever the selection changes and is collapsed, make
    // sure the cursor is visible.  Also, have a facility to
    // ignore a single iteration of this, which we use when
    // the selection change is being caused by realtime
    // collaboration.

    // @ts-ignore
    const skip = editor.syncCausedUpdate;
    if (
      editor.selection != null &&
      Range.isCollapsed(editor.selection) &&
      !skip
    ) {
      editor.scrollCaretIntoView();
    }
  }, [editor.selection]);

  // Listen on the native `beforeinput` event to get real "Level 2" events. This
  // is required because React's `beforeinput` is fake and never really attaches
  // to the real event sadly. (2019/11/01)
  // https://github.com/facebook/react/issues/11211
  const onDOMBeforeInput = useCallback(
    (
      event: Event & {
        data: string | null;
        dataTransfer: DataTransfer | null;
        getTargetRanges(): DOMStaticRange[];
        inputType: string;
        isComposing: boolean;
      }
    ) => {
      if (
        !readOnly &&
        hasEditableTarget(editor, event.target) &&
        !isDOMEventHandled(event, propsOnDOMBeforeInput)
      ) {
        const { selection } = editor;
        const { inputType: type } = event;
        const data = event.dataTransfer || event.data || undefined;

        // These two types occur while a user is composing text and can't be
        // cancelled. Let them through and wait for the composition to end.
        if (
          type === "insertCompositionText" ||
          type === "deleteCompositionText"
        ) {
          return;
        }

        event.preventDefault();

        // COMPAT: For the deleting forward/backward input types we don't want
        // to change the selection because it is the range that will be deleted,
        // and those commands determine that for themselves.
        if (!type.startsWith("delete") || type.startsWith("deleteBy")) {
          const [targetRange] = event.getTargetRanges();

          if (targetRange) {
            let range;
            try {
              range = ReactEditor.toSlateRange(editor, targetRange);
            } catch (err) {
              console.warn(
                "WARNING: onDOMBeforeInput -- unable to find SlateRange",
                targetRange,
                err
              );
              return;
            }

            if (!selection || !Range.equals(selection, range)) {
              Transforms.select(editor, range);
            }
          }
        }

        // COMPAT: If the selection is expanded, even if the command seems like
        // a delete forward/backward command it should delete the selection.
        if (
          selection &&
          Range.isExpanded(selection) &&
          type.startsWith("delete")
        ) {
          Editor.deleteFragment(editor);
          return;
        }

        switch (type) {
          case "deleteByComposition":
          case "deleteByCut":
          case "deleteByDrag": {
            Editor.deleteFragment(editor);
            break;
          }

          case "deleteContent":
          case "deleteContentForward": {
            Editor.deleteForward(editor);
            break;
          }

          case "deleteContentBackward": {
            Editor.deleteBackward(editor);
            break;
          }

          case "deleteEntireSoftLine": {
            Editor.deleteBackward(editor, { unit: "line" });
            Editor.deleteForward(editor, { unit: "line" });
            break;
          }

          case "deleteHardLineBackward": {
            Editor.deleteBackward(editor, { unit: "block" });
            break;
          }

          case "deleteSoftLineBackward": {
            Editor.deleteBackward(editor, { unit: "line" });
            break;
          }

          case "deleteHardLineForward": {
            Editor.deleteForward(editor, { unit: "block" });
            break;
          }

          case "deleteSoftLineForward": {
            Editor.deleteForward(editor, { unit: "line" });
            break;
          }

          case "deleteWordBackward": {
            Editor.deleteBackward(editor, { unit: "word" });
            break;
          }

          case "deleteWordForward": {
            Editor.deleteForward(editor, { unit: "word" });
            break;
          }

          case "insertLineBreak":
          case "insertParagraph": {
            Editor.insertBreak(editor);
            break;
          }

          case "insertFromComposition": {
            // COMPAT: in safari, `compositionend` event is dispatched after
            // the beforeinput event with the inputType "insertFromComposition" has been dispatched.
            // https://www.w3.org/TR/input-events-2/
            // so the following code is the right logic
            // because DOM selection in sync will be exec before `compositionend` event
            // isComposing is true will prevent DOM selection being update correctly.
            state.isComposing = false;
          }
          case "insertFromDrop":
          case "insertFromPaste":
          case "insertFromYank":
          case "insertReplacementText":
          case "insertText": {
            if (data instanceof DataTransfer) {
              ReactEditor.insertData(editor, data);
            } else if (typeof data === "string") {
              try {
                Editor.insertText(editor, data);
              } catch (err) {
                // I've seen this crash several times in a way I can't reproduce, maybe
                // when focusing (not sure).  Better make it a warning with useful info.
                console.warn(
                  `SLATE -- issue with DOM insertText operation ${err}, ${data}`
                );
              }
            }

            break;
          }
        }
      }
    },
    [readOnly, propsOnDOMBeforeInput]
  );

  // Attach a native DOM event handler for `beforeinput` events, because React's
  // built-in `onBeforeInput` is actually a leaky polyfill that doesn't expose
  // real `beforeinput` events sadly... (2019/11/04)
  // https://github.com/facebook/react/issues/11211
  useIsomorphicLayoutEffect(() => {
    if (ref.current && HAS_BEFORE_INPUT_SUPPORT) {
      // @ts-ignore The `beforeinput` event isn't recognized.
      ref.current.addEventListener("beforeinput", onDOMBeforeInput);
    }

    return () => {
      if (ref.current && HAS_BEFORE_INPUT_SUPPORT) {
        // @ts-ignore The `beforeinput` event isn't recognized.
        ref.current.removeEventListener("beforeinput", onDOMBeforeInput);
      }
    };
  }, [onDOMBeforeInput]);

  useUpdateDOMSelection({ editor, state });
  const DOMSelectionChange = useDOMSelectionChange({ editor, state, readOnly });

  const decorations = decorate([editor, []]);

  if (
    placeholder &&
    editor.children.length === 1 &&
    Array.from(Node.texts(editor)).length === 1 &&
    Node.string(editor) === ""
  ) {
    const start = Editor.start(editor, []);
    decorations.push({
      [PLACEHOLDER_SYMBOL]: true,
      placeholder,
      anchor: start,
      focus: start,
    } as any);
  }

  return (
    <ReadOnlyContext.Provider value={readOnly}>
      <Component
        role={readOnly ? undefined : "textbox"}
        {...attributes}
        // COMPAT: Certain browsers don't support the `beforeinput` event, so we'd
        // have to use hacks to make these replacement-based features work.
        spellCheck={
          !HAS_BEFORE_INPUT_SUPPORT ? undefined : attributes.spellCheck
        }
        autoCorrect={
          !HAS_BEFORE_INPUT_SUPPORT ? undefined : attributes.autoCorrect
        }
        autoCapitalize={
          !HAS_BEFORE_INPUT_SUPPORT ? undefined : attributes.autoCapitalize
        }
        data-slate-editor
        data-slate-node="value"
        contentEditable={readOnly ? undefined : true}
        suppressContentEditableWarning
        ref={ref}
        style={{
          // Prevent the default outline styles.
          outline: "none",
          // Preserve adjacent whitespace and new lines.
          whiteSpace: "pre-wrap",
          // Allow words to break if they are too long.
          wordWrap: "break-word",
          // Allow for passed-in styles to override anything.
          ...style,
        }}
        onBeforeInput={useCallback(
          (event: React.FormEvent<HTMLDivElement>) => {
            // COMPAT: Certain browsers don't support the `beforeinput` event, so we
            // fall back to React's leaky polyfill instead just for it. It
            // only works for the `insertText` input type.
            if (
              !HAS_BEFORE_INPUT_SUPPORT &&
              shouldHandle({ event, name: "onBeforeInput", notReadOnly: true })
            ) {
              event.preventDefault();
              const text = (event as any).data as string;
              Editor.insertText(editor, text);
            }
          },
          [readOnly]
        )}
        onBlur={useCallback(
          (event: React.FocusEvent<HTMLDivElement>) => {
            if (!shouldHandle({ event, name: "onBlur", notReadOnly: true })) {
              return;
            }

            // COMPAT: If the current `activeElement` is still the previous
            // one, this is due to the window being blurred when the tab
            // itself becomes unfocused, so we want to abort early to allow to
            // editor to stay focused when the tab becomes focused again.
            if (state.latestElement === window.document.activeElement) {
              return;
            }

            const { relatedTarget } = event;
            const el = ReactEditor.toDOMNode(editor, editor);

            // COMPAT: The event should be ignored if the focus is returning
            // to the editor from an embedded editable element (eg. an <input>
            // element inside a void node).
            if (relatedTarget === el) {
              return;
            }

            // COMPAT: The event should be ignored if the focus is moving from
            // the editor to inside a void node's spacer element.
            if (
              isDOMElement(relatedTarget) &&
              relatedTarget.hasAttribute("data-slate-spacer")
            ) {
              return;
            }

            // COMPAT: The event should be ignored if the focus is moving to a
            // non- editable section of an element that isn't a void node (eg.
            // a list item of the check list example).
            if (
              relatedTarget != null &&
              isDOMNode(relatedTarget) &&
              ReactEditor.hasDOMNode(editor, relatedTarget)
            ) {
              const node = ReactEditor.toSlateNode(editor, relatedTarget);

              if (Element.isElement(node) && !editor.isVoid(node)) {
                return;
              }
            }

            IS_FOCUSED.delete(editor);
          },
          [readOnly, attributes.onBlur]
        )}
        onClick={useCallback(
          (event: React.MouseEvent<HTMLDivElement>) => {
            if (
              shouldHandle({
                event,
                name: "onClick",
                notReadOnly: true,
                editableTarget: false,
              }) &&
              isDOMNode(event.target)
            ) {
              let node;
              try {
                node = ReactEditor.toSlateNode(editor, event.target);
              } catch (err) {
                // node not actually in editor.
                return;
              }
              let path;
              try {
                path = ReactEditor.findPath(editor, node);
              } catch (err) {
                console.warn(
                  "WARNING: onClick -- unable to find path to node",
                  node,
                  err
                );
                return;
              }
              const start = Editor.start(editor, path);
              const end = Editor.end(editor, path);

              const startVoid = Editor.void(editor, { at: start });
              const endVoid = Editor.void(editor, { at: end });

              // We set selection either if we're not
              // focused *or* clicking on a void.  The
              // not focused part isn't upstream, but we
              // need it to have codemirror blocks.
              if (
                editor.selection == null ||
                !ReactEditor.isFocused(editor) ||
                (startVoid && endVoid && Path.equals(startVoid[1], endVoid[1]))
              ) {
                const range = Editor.range(editor, start);
                Transforms.select(editor, range);
              }
            }
          },
          [readOnly, attributes.onClick]
        )}
        onCompositionEnd={useCallback(
          (event: React.CompositionEvent<HTMLDivElement>) => {
            if (
              shouldHandle({
                event,
                name: "onCompositionEnd",
                notReadOnly: true,
              })
            ) {
              state.isComposing = false;
              // console.log(`onCompositionEnd :'${event.data}'`);

              // COMPAT: In Chrome, `beforeinput` events for compositions
              // aren't correct and never fire the "insertFromComposition"
              // type that we need. So instead, insert whenever a composition
              // ends since it will already have been committed to the DOM.
              if (!IS_SAFARI && !IS_FIREFOX && event.data) {
                Editor.insertText(editor, event.data);
              }
            }
          },
          [attributes.onCompositionEnd]
        )}
        onCompositionStart={useCallback(
          (event: React.CompositionEvent<HTMLDivElement>) => {
            if (
              shouldHandle({
                event,
                name: "onCompositionStart",
                notReadOnly: true,
              })
            ) {
              state.isComposing = true;
              // console.log("onCompositionStart");
            }
          },
          [attributes.onCompositionStart]
        )}
        onCopy={useCallback(
          (event: React.ClipboardEvent<HTMLDivElement>) => {
            if (shouldHandle({ event, name: "onCopy" })) {
              event.preventDefault();
              ReactEditor.setFragmentData(editor, event.clipboardData);
            }
          },
          [attributes.onCopy]
        )}
        onCut={useCallback(
          (event: React.ClipboardEvent<HTMLDivElement>) => {
            if (shouldHandle({ event, name: "onCut", notReadOnly: true })) {
              event.preventDefault();
              ReactEditor.setFragmentData(editor, event.clipboardData);
              const { selection } = editor;

              if (selection) {
                if (Range.isExpanded(selection)) {
                  Editor.deleteFragment(editor);
                } else {
                  const node = Node.parent(editor, selection.anchor.path);
                  if (Editor.isVoid(editor, node)) {
                    Transforms.delete(editor);
                  }
                }
              }
            }
          },
          [readOnly, attributes.onCut]
        )}
        onDragOver={useCallback(
          (event: React.DragEvent<HTMLDivElement>) => {
            if (
              shouldHandle({
                event,
                name: "onDragOver",
                editableTarget: false,
              })
            ) {
              if (!hasTarget(editor, event.target)) return; // for typescript only
              // Only when the target is void, call `preventDefault` to signal
              // that drops are allowed. Editable content is droppable by
              // default, and calling `preventDefault` hides the cursor.
              const node = ReactEditor.toSlateNode(editor, event.target);

              if (Editor.isVoid(editor, node)) {
                event.preventDefault();
              }
            }
          },
          [attributes.onDragOver]
        )}
        onDragStart={useCallback(
          (event: React.DragEvent<HTMLDivElement>) => {
            if (
              shouldHandle({
                event,
                name: "onDragStart",
                editableTarget: false,
              })
            ) {
              if (!hasTarget(editor, event.target)) return; // for typescript only
              const node = ReactEditor.toSlateNode(editor, event.target);
              let path;
              try {
                path = ReactEditor.findPath(editor, node);
              } catch (err) {
                console.warn(
                  "WARNING: onDragStart -- unable to find path to node",
                  node,
                  err
                );
                return;
              }
              const voidMatch = Editor.void(editor, { at: path });

              // If starting a drag on a void node, make sure it is selected
              // so that it shows up in the selection's fragment.
              if (voidMatch) {
                const range = Editor.range(editor, path);
                Transforms.select(editor, range);
              }

              ReactEditor.setFragmentData(editor, event.dataTransfer);
            }
          },
          [attributes.onDragStart]
        )}
        onDrop={useCallback(
          (event: React.DragEvent<HTMLDivElement>) => {
            if (
              shouldHandle({
                event,
                name: "onDrop",
                editableTarget: false,
                notReadOnly: true,
              })
            ) {
              // COMPAT: Certain browsers don't fire `beforeinput` events at all, and
              // Chromium browsers don't properly fire them for files being
              // dropped into a `contenteditable`. (2019/11/26)
              // https://bugs.chromium.org/p/chromium/issues/detail?id=1028668
              if (
                !HAS_BEFORE_INPUT_SUPPORT ||
                (!IS_SAFARI && event.dataTransfer.files.length > 0)
              ) {
                event.preventDefault();
                let range;
                try {
                  range = ReactEditor.findEventRange(editor, event);
                } catch (err) {
                  console.warn("WARNING: onDrop -- unable to find range", err);
                  return;
                }
                const data = event.dataTransfer;
                Transforms.select(editor, range);
                ReactEditor.insertData(editor, data);
              }
            }
          },
          [readOnly, attributes.onDrop]
        )}
        onFocus={useCallback(
          (event: React.FocusEvent<HTMLDivElement>) => {
            if (shouldHandle({ event, name: "onFocus", notReadOnly: true })) {
              // Call DOMSelectionChange so we can capture what was just
              // selected in the DOM to cause this focus.
              DOMSelectionChange();
              state.latestElement = window.document.activeElement;
              IS_FOCUSED.set(editor, true);
            }
          },
          [readOnly, attributes.onFocus]
        )}
        onKeyUp={useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
          state.shiftKey = event.shiftKey;
        }, [])}
        onKeyDown={useCallback(
          (event: React.KeyboardEvent<HTMLDivElement>) => {
            state.shiftKey = event.shiftKey;
            if (
              state.isComposing ||
              !shouldHandle({ event, name: "onKeyDown", notReadOnly: true })
            ) {
              return;
            }

            const { nativeEvent } = event;
            const { selection } = editor;

            // COMPAT: Since we prevent the default behavior on
            // `beforeinput` events, the browser doesn't think there's ever
            // any history stack to undo or redo, so we have to manage these
            // hotkeys ourselves. (2019/11/06)
            if (Hotkeys.isRedo(nativeEvent)) {
              event.preventDefault();

              /*
                if (HistoryEditor.isHistoryEditor(editor)) {
                  editor.redo();
                }
                */

              return;
            }

            if (Hotkeys.isUndo(nativeEvent)) {
              event.preventDefault();

              /*
                if (HistoryEditor.isHistoryEditor(editor)) {
                  editor.undo();
                }*/

              return;
            }

            // COMPAT: Certain browsers don't handle the selection updates
            // properly. In Chrome, the selection isn't properly extended.
            // And in Firefox, the selection isn't properly collapsed.
            // (2017/10/17)
            if (Hotkeys.isMoveLineBackward(nativeEvent)) {
              event.preventDefault();
              Transforms.move(editor, { unit: "line", reverse: true });
              return;
            }

            if (Hotkeys.isMoveLineForward(nativeEvent)) {
              event.preventDefault();
              Transforms.move(editor, { unit: "line" });
              return;
            }

            if (Hotkeys.isExtendLineBackward(nativeEvent)) {
              event.preventDefault();
              Transforms.move(editor, {
                unit: "line",
                edge: "focus",
                reverse: true,
              });
              return;
            }

            if (Hotkeys.isExtendLineForward(nativeEvent)) {
              event.preventDefault();
              Transforms.move(editor, { unit: "line", edge: "focus" });
              return;
            }

            const element = editor.children[selection?.focus.path[0] ?? 0];
            // @ts-ignore -- typescript gets confused by type of getDirection
            const isRTL = getDirection(Node.string(element)) === "rtl";

            // COMPAT: If a void node is selected, or a zero-width text node
            // adjacent to an inline is selected, we need to handle these
            // hotkeys manually because browsers won't be able to skip over
            // the void node with the zero-width space not being an empty
            // string.
            if (Hotkeys.isMoveBackward(nativeEvent)) {
              event.preventDefault();

              if (selection && Range.isCollapsed(selection)) {
                Transforms.move(editor, { reverse: !isRTL });
              } else {
                Transforms.collapse(editor, { edge: "start" });
              }

              return;
            }

            if (Hotkeys.isMoveForward(nativeEvent)) {
              event.preventDefault();

              if (selection && Range.isCollapsed(selection)) {
                Transforms.move(editor, { reverse: isRTL });
              } else {
                Transforms.collapse(editor, { edge: "end" });
              }

              return;
            }

            if (Hotkeys.isMoveWordBackward(nativeEvent)) {
              event.preventDefault();
              Transforms.move(editor, { unit: "word", reverse: !isRTL });
              return;
            }

            if (Hotkeys.isMoveWordForward(nativeEvent)) {
              event.preventDefault();
              Transforms.move(editor, { unit: "word", reverse: isRTL });
              return;
            }

            // COMPAT: Certain browsers don't support the `beforeinput` event, so we
            // fall back to guessing at the input intention for hotkeys.
            // COMPAT: In iOS, some of these hotkeys are handled in the
            if (!HAS_BEFORE_INPUT_SUPPORT) {
              // We don't have a core behavior for these, but they change the
              // DOM if we don't prevent them, so we have to.
              if (
                Hotkeys.isBold(nativeEvent) ||
                Hotkeys.isItalic(nativeEvent) ||
                Hotkeys.isTransposeCharacter(nativeEvent)
              ) {
                event.preventDefault();
                return;
              }

              if (Hotkeys.isSplitBlock(nativeEvent)) {
                event.preventDefault();
                Editor.insertBreak(editor);
                return;
              }

              if (Hotkeys.isDeleteBackward(nativeEvent)) {
                event.preventDefault();

                if (selection && Range.isExpanded(selection)) {
                  Editor.deleteFragment(editor);
                } else {
                  Editor.deleteBackward(editor);
                }

                return;
              }

              if (Hotkeys.isDeleteForward(nativeEvent)) {
                event.preventDefault();

                if (selection && Range.isExpanded(selection)) {
                  Editor.deleteFragment(editor);
                } else {
                  Editor.deleteForward(editor);
                }

                return;
              }

              if (Hotkeys.isDeleteLineBackward(nativeEvent)) {
                event.preventDefault();

                if (selection && Range.isExpanded(selection)) {
                  Editor.deleteFragment(editor);
                } else {
                  Editor.deleteBackward(editor, { unit: "line" });
                }

                return;
              }

              if (Hotkeys.isDeleteLineForward(nativeEvent)) {
                event.preventDefault();

                if (selection && Range.isExpanded(selection)) {
                  Editor.deleteFragment(editor);
                } else {
                  Editor.deleteForward(editor, { unit: "line" });
                }

                return;
              }

              if (Hotkeys.isDeleteWordBackward(nativeEvent)) {
                event.preventDefault();

                if (selection && Range.isExpanded(selection)) {
                  Editor.deleteFragment(editor);
                } else {
                  Editor.deleteBackward(editor, { unit: "word" });
                }

                return;
              }

              if (Hotkeys.isDeleteWordForward(nativeEvent)) {
                event.preventDefault();

                if (selection && Range.isExpanded(selection)) {
                  Editor.deleteFragment(editor);
                } else {
                  Editor.deleteForward(editor, { unit: "word" });
                }

                return;
              }
            }

            if (
              !event.altKey &&
              !event.ctrlKey &&
              !event.metaKey &&
              event.key.length == 1 &&
              !ReactEditor.selectionIsInDOM(editor)
            ) {
              // user likely typed a character so insert it
              editor.insertText(event.key);
              event.preventDefault();
              return;
            }
          },
          [readOnly, attributes.onKeyDown]
        )}
        onPaste={useCallback(
          (event: React.ClipboardEvent<HTMLDivElement>) => {
            // COMPAT: Certain browsers don't support the `beforeinput` event, so we
            // fall back to React's `onPaste` here instead.
            // COMPAT: Firefox, Chrome and Safari are not emitting `beforeinput` events
            // when "paste without formatting" option is used.
            // This unfortunately needs to be handled with paste events instead.
            if (
              shouldHandle({ event, name: "onPaste", notReadOnly: true }) &&
              (!HAS_BEFORE_INPUT_SUPPORT ||
                isPlainTextOnlyPaste(event.nativeEvent))
            ) {
              event.preventDefault();
              ReactEditor.insertData(editor, event.clipboardData);
            }
          },
          [readOnly, attributes.onPaste]
        )}
      >
        <DecorateContext.Provider value={decorate}>
          <Children
            isComposing={state.isComposing}
            decorations={decorations}
            node={editor}
            renderElement={renderElement}
            renderLeaf={renderLeaf}
            selection={editor.selection}
            hiddenChildren={hiddenChildren}
            windowing={windowing}
            onScroll={() => {
              if (editor.scrollCaretAfterNextScroll) {
                editor.scrollCaretAfterNextScroll = false;
              }
              editor.updateDOMSelection?.();
              props.onScroll?.({} as any);
            }}
          />
        </DecorateContext.Provider>
      </Component>
    </ReadOnlyContext.Provider>
  );
};

/**
 * A default memoized decorate function.
 */

const defaultDecorate: (entry: NodeEntry) => Range[] = () => [];

/**
 * Check if an event is overrided by a handler.
 */

const isEventHandled = <
  EventType extends React.SyntheticEvent<unknown, unknown>
>(
  event: EventType,
  handler?: (event: EventType) => void
) => {
  if (!handler) {
    return false;
  }

  handler(event);
  return event.isDefaultPrevented() || event.isPropagationStopped();
};

/**
 * Check if a DOM event is overrided by a handler.
 */

const isDOMEventHandled = (event: Event, handler?: (event: Event) => void) => {
  if (!handler) {
    return false;
  }

  handler(event);
  return event.defaultPrevented;
};
