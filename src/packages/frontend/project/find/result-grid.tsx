import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import {
  VirtuosoGrid,
  type GridItemProps,
  type VirtuosoGridHandle,
} from "react-virtuoso";

export function FindResultsGrid({
  totalCount,
  itemContent,
  listRef,
  minItemWidth = 320,
}: {
  totalCount: number;
  itemContent: (index: number) => ReactNode;
  listRef?: React.Ref<VirtuosoGridHandle>;
  minItemWidth?: number;
}) {
  return (
    <VirtuosoGrid
      ref={listRef}
      style={{ flex: 1, minHeight: 0 }}
      totalCount={totalCount}
      itemContent={itemContent}
      components={{
        List: forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
          function List(props, ref) {
            return (
              <div
                ref={ref}
                {...props}
                style={{
                  ...props.style,
                  display: "grid",
                  gridTemplateColumns: `repeat(auto-fit, minmax(${minItemWidth}px, 1fr))`,
                  gap: "8px",
                  padding: "4px",
                }}
              />
            );
          },
        ),
        Item: ({ children, ...props }: GridItemProps) => (
          <div {...props} style={{ ...props.style, padding: 0 }}>
            {children}
          </div>
        ),
      }}
    />
  );
}
