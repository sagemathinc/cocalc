import * as React from "react";
import { redux } from "./app-framework";
import { start } from "./ab-test";

interface Props {
  a_path: React.ReactNode;
  b_path: React.ReactNode;
}

/**
 * Renders the correct path if an A/B test is active.
 * Defaults to `a_path` if no test is active.
 */
export const ABTestSplitter = ({ a_path, b_path }: Props) => {
  React.useEffect(() => {
    if (!redux.getStore("abtest")) {
      start();
    }
  }, []);
  let path: "A" | "B" = "A";
  const abtest = redux.getStore("abtest");
  if (abtest?.get("is_active")) {
    path = abtest.get("version") ?? "A";
  }
  return <>{path === "A" ? a_path : b_path}</>;
};
