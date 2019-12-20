import * as React from "react";
import { List } from "immutable";
import { computeVersion } from "../../ab-testing";

interface Props {
  ab_test_entries: List<any>;
}

export const Results: React.FC<Props> = React.memo(({ ab_test_entries }) => {
  const test_name = ab_test_entries.getIn([0, "test_name"]);

  const results = ab_test_entries.reduce(
    (results, entry) => {
      const version = computeVersion(entry.get("account_id"));
      const events = entry.get("events");

      let clicked_button = false;
      let signed_up = false;
      events.forEach(payload => {
        if (payload.get("action") === "Clicked Button") {
          clicked_button = true;
        }
        if (payload.get("action") == "Signed up") {
          signed_up = true;
        }
      });
      results[version].clicked_button += clicked_button ? 1 : 0;
      results[version].signed_up += signed_up ? 1 : 0;
      results[version].total += 1;
      return results;
    },
    {
      A: { signed_up: 0, clicked_button: 0, total: 0 },
      B: { signed_up: 0, clicked_button: 0, total: 0 }
    }
  );
  console.log(results);

  const A = results.A;
  const B = results.B;
  const A_fails = A.total - A.signed_up;
  const B_fails = B.total - B.signed_up;
  const total_users = ab_test_entries.size;
  const total_sign_ups = A.signed_up + B.signed_up;
  const total_fails = total_users - total_sign_ups;

  const expected_A_sign_up = (A.total * total_sign_ups) / total_users;
  const expected_A_fail = (A.total * total_fails) / total_users;
  const expected_B_sign_up = (B.total * total_sign_ups) / total_users;
  const expected_B_fail = (B.total * total_fails) / total_users;

  const chi_A_sign_up =
    (expected_A_sign_up - A.signed_up) ** 2 / expected_A_sign_up;
  const chi_A_fail = (expected_A_fail - A_fails) ** 2 / expected_A_fail;
  const chi_B_sign_up =
    (expected_B_sign_up - B.signed_up) ** 2 / expected_B_sign_up;
  const chi_B_fail = (expected_B_fail - B_fails) ** 2 / expected_B_fail;

  const chi_sum = chi_A_sign_up + chi_A_fail + chi_B_sign_up + chi_B_fail;

  const A_sign_up_percent = Math.trunc((A.signed_up / A.total) * 10000)/100;
  const B_sign_up_percent = Math.trunc((B.signed_up / B.total) * 10000)/100;

  return (
    <div>
      <h2>{test_name}</h2>
      Chi sum: {chi_sum}
      <br />A sign up percent: {A_sign_up_percent}% <br />B sign up percent:{" "}
      {B_sign_up_percent}% <br />
    </div>
  );
});
