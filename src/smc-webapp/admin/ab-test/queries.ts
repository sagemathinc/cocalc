import { query } from "../../frame-editors/generic/client";
import { fromJS } from "../../app-framework/immutable-types";
import { List } from "immutable";

export async function log(
  account_id: string,
  test_name: string,
  payload: Record<string, any>,
  time: Date = new Date()
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
  ab_test: string
): Promise<[string | undefined, List<any> | undefined]> {
  let result: { query: { abtest: any[] } };
  try {
    result = await query({
      query: {
        abtest: [
          {
            test_name: ab_test,
            account_id: null,
            time: null,
            payload: null
          }
        ]
      }
    });
  } catch {
    return ["Something bad happened", undefined];
  }
  return [undefined, fromJS(result.query.abtest)];
}
