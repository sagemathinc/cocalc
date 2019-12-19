import { redux, Store } from "./app-framework";
import { log } from "./admin/ab-test";

interface ABTestStoreState {
  is_active: boolean;
  version: "A" | "B";
  name: TESTNAME;
}

type TESTNAME = "sign_up_button";
type SignUpAction = "Load page" | "Clicked Button" | "Signed up";
class SignUpTest {
  public name = "sign_up_button" as const;
  public log = (action: SignUpAction): void => {
    if (action !== "Load page") {
      log_abtest({ action }, this.name);
    } else {
      const now = new Date();
      setTimeout(() => {
        if (redux.getStore("account")?.get("is_anonymous")) {
          log_abtest({ action }, this.name, now);
        }
      }, 5000);
    }
  };
}

const log_abtest = (payload, test_name: TESTNAME, time = new Date()): void => {
  const account = redux.getStore("account");
  const abtest = redux.getStore("abtest");
  if (
    account?.get("is_anonymous") &&
    abtest?.get("is_active") &&
    abtest.get("name") === test_name
  ) {
    log(
      account.get("account_id"),
      test_name,
      {
        version: abtest.get("version"),
        referrer: document.referrer,
        ...payload
      },
      time
    );
  }
  // No-op if test isn't active
};

export const current_test = new SignUpTest();

export const start = (): void => {
  let version: "A" | "B" = "A";
  if (
    // If first digit less than 8 (uuids are made up of hex digits)
    parseInt(redux.getStore("account")?.get("account_id")[0] ?? 0, 16) < 8
  ) {
    version = "B";
  }
  redux.createStore<ABTestStoreState, Store<ABTestStoreState>>(
    "abtest",
    Store,
    {
      name: current_test.name,
      is_active: true,
      version
    }
  );
};
