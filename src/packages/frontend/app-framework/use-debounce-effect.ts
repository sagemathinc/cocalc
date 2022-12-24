/*
This is like useEffect, except it is debounced.

Because it is debounced, the function itself can't be changed after you
create the hook.  Thus instead of the parameters it depends on implicitly
changing, the function must *explicitly* take as inputs the dependency
list.  Fortunately, typescript ensures this.

*/

import { debounce } from "lodash";
import type { DependencyList } from "react";
import { useEffect, useMemo } from "react";

export default function useDebounceEffect<T extends DependencyList>(
  {
    func,
    wait,
    options,
  }: { func: (T) => void | (() => void); wait: number; options? },
  deps: T
) {
  const f = useMemo(() => debounce(func, wait, options), []);

  useEffect(() => f(deps), deps);
}
