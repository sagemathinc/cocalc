import * as React from "react";
import { callback2 } from "smc-util/async-utils";
import { redux } from "../app-framework";
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
  const [path, setPath] = React.useState<"A" | "B">("A");

  React.useEffect(() => {
    const choose_path_if_necessary = async () => {
      // Wait until we're signed in.
      await callback2(redux.getStore("account").wait, {
        until: store => {
          if (store.get("is_logged_in")) {
            return redux.getStore("account").get("account_id");
          }
        }
      });
      let abtest: any = redux.getStore("abtest");
      if (!abtest) {
        abtest = start();
      }
      if (abtest.get("is_active")) {
        setPath(abtest.get("version"));
      }
    };
    choose_path_if_necessary();
  }, []);

  return <>{path === "A" ? a_path : b_path}</>;
};
