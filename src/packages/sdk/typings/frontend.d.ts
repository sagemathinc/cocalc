declare module "@cocalc/frontend/sdk/hooks" {
  export function useEditorState<T = unknown>(...args: any[]): T;
  export function useSyncDB<T = unknown>(...args: any[]): T;
  export function useSyncValue<T = unknown>(...args: any[]): T;
}

declare module "@cocalc/frontend/frame-editors/code-editor/codemirror-editor" {
  const CodemirrorEditor: any;
  export { CodemirrorEditor };
  export default CodemirrorEditor;
}

declare module "@cocalc/frontend/components/data-grid/headings" {
  export type SortDirection = "ascending" | "descending";
  export const ColumnHeading: any;
}

declare module "@cocalc/frontend/frame-editors/frame-tree/frame-context" {
  export function useFrameContext(...args: any[]): any;
}
