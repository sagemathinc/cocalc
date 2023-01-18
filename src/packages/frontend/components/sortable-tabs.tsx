import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToHorizontalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import {
  ReactNode,
  useMemo,
  useRef,
  useState,
  createContext,
  useContext,
} from "react";
import useResizeObserver from "use-resize-observer";

export { useSortable };

interface Props {
  onDragStart?: ((event) => void) | undefined;
  onDragEnd?: ((event) => void) | undefined;
  items: (string | number)[];
  children?: ReactNode;
}

interface ItemContextType {
  width: number | null;
}

const ItemContext = createContext<ItemContextType>({
  width: null,
});

export function useItemContext() {
  return useContext(ItemContext);
}

export function SortableTabs({
  onDragStart,
  onDragEnd,
  items,
  children,
}: Props) {
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 2,
    },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 100,
      tolerance: 3,
    },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  const divRef = useRef<any>(null);
  const [hover, setHover] = useState<boolean>(false);
  const resize = useResizeObserver({ ref: divRef });
  const lastRef = useRef<{
    width: number;
    length: number;
    itemWidth: number;
  } | null>(null);

  const itemWidth = useMemo(() => {
    if (divRef.current == null) {
      lastRef.current = null;
      return null;
    }
    const last = lastRef.current;
    if (
      last != null &&
      last.width == resize.width &&
      items.length <= last.length &&
      hover
    ) {
      // @ts-ignore
      lastRef.current.length = items.length;
      return last.itemWidth;
    }
    const itemWidth =
      Math.max(
        150,
        Math.min(250 + 65, (resize?.width ?? 0) / Math.max(1, items.length))
      ) - 65; // the 55 accounts for the margin and x for an antd tab.
    lastRef.current = {
      width: resize.width ?? 0,
      length: items.length,
      itemWidth,
    };
    return itemWidth;
  }, [resize.width, items.length, divRef.current, hover]);

  return (
    <div
      style={{ width: "100%" }}
      ref={divRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <ItemContext.Provider value={{ width: itemWidth }}>
        <DndContext
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
          sensors={sensors}
        >
          <SortableContext
            items={items}
            strategy={horizontalListSortingStrategy}
          >
            {children}
          </SortableContext>
        </DndContext>
        {children}
      </ItemContext.Provider>
    </div>
  );
}

export function SortableTab({ children, id }) {
  const { attributes, listeners, setNodeRef, transform, transition, active } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
        zIndex: active?.id == id ? 1 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

export function renderTabBar(tabBarProps, DefaultTabBar) {
  return (
    <DefaultTabBar {...tabBarProps}>
      {(node) => (
        <SortableTab key={node.key} id={node.key}>
          {node}
        </SortableTab>
      )}
    </DefaultTabBar>
  );
}
