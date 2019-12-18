import { query } from "../../frame-editors/generic/client";

export async function log(
  account_id = "test",
  test_name = "test",
  payload = { test: true },
  time = new Date()
) {
  await query({
    query: {
      abtest: {
        account_id,
        test_name,
        time,
        payload
      }
    }
  });
}

export async function get_ab_test(ab_test: string) {
  return await query({
    query: {
      abtest: {
        account_id: "test",
        test_name: ab_test
      }
    }
  });
}
