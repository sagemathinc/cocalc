/*
Support for the project's websocket-based request/response API, which is used for handling
various messages related to working with Jupyter.
*/

import { get_existing_kernel } from "./jupyter";
import { get_code_and_cursor_pos } from "./http-server";

export async function handle_request(
  path: string,
  action: string,
  query: any
): Promise<any> {
  const kernel = get_existing_kernel(path);
  if (kernel == null) {
    throw Error(`no kernel with path '${path}'`);
  }
  switch (action) {
    case "signal":
      kernel.signal(query.signal);
      return {};
    case "kernel_info":
      return await kernel.kernel_info();
    case "more_output":
      return kernel.more_output(query.id);
    case "complete":
      return await kernel.complete(get_code_and_cursor_pos(query));
    case "introspect":
      const { code, cursor_pos } = get_code_and_cursor_pos(query);
      let detail_level = 0;
      if (query.level != null) {
        try {
          detail_level = parseInt(query.level);
          if (detail_level < 0) {
            detail_level = 0;
          } else if (detail_level > 1) {
            detail_level = 1;
          }
        } catch (err) {}
      }
      return await kernel.introspect({
        code,
        cursor_pos,
        detail_level
      });
    case "store":
      let key, value;
      if (query.key != null) {
        key = JSON.parse(query.key);
      } else {
        key = undefined;
      }
      if (query.value != null) {
        value = JSON.parse(query.value);
      } else {
        value = undefined;
      }
      if (value === undefined) {
        // undefined when getting the value
        return kernel.store.get(key);
      } else if (value === null) {
        // null is used for deleting the value
        kernel.store.delete(key);
        return {};
      } else {
        kernel.store.set(key, value);
        return {};
      }
    default:
      throw Error(`unknown action "${action}"`);
  }
}
