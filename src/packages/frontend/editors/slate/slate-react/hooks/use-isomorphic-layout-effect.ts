import { useLayoutEffect, useEffect } from "react";

/**
 * Prevent warning on SSR (server side rendering) by falling back to useEffect when window is not defined
 */
export const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;
