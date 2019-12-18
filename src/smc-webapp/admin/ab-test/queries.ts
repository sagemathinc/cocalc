import { query } from "../../frame-editors/generic/client";
import { List, fromJS } from "immutable";

export async function log(
  account_id = "a1fdad63-8a72-4cec-af94-52fa0a32b38d",
  test_name = "test2",
  payload = { test: false },
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

export async function get_ab_test(
  _ab_test: string
): [string | undefined, List<any>] {
  let result: any;
  try {
    result = await query({
      query: {
        abtest: [
          {
            test_name: "test2",
            account_id: null,
            time: null,
            payload: null
          }
        ]
      }
    });
  } catch {
    return ["Something bad happened", []];
  }
  return [undefined, fromJS(result.query.abtest) as List<any>];
}
