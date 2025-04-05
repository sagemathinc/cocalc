/*


DEVELOPMENT:

Go to packages/project/nats/open-files.ts and for a dev project, stop the built in open files service
and start your own in a terminal.  If you then open a jupyter notebook in that project, you can use
your terminal running the open files service to interact with anything here from the server size.
In particular, set global.x = ..., etc.
*/

import { createNatsJupyterService } from "@cocalc/nats/service/jupyter";
import { get_existing_kernel as getKernel } from "@cocalc/jupyter/kernel";
import { bufferToBase64 } from "@cocalc/util/base64";

export async function initNatsService({
  path,
  project_id,
}: {
  path: string;
  project_id: string;
}) {
  const getExistingKernel = () => {
    const kernel = getKernel(path);
    if (kernel == null) {
      throw Error(`no Jupyter kernel with path '${path}'`);
    }
    return kernel;
  };

  const impl = {
    // Signal should be a string like "SIGINT", "SIGKILL".
    signal: async (signal: string) => {
      getKernel(path)?.signal(signal);
    },

    save_ipynb_file: async () => {
      await getExistingKernel().save_ipynb_file();
    },

    kernel_info: async () => {
      return await getExistingKernel().kernel_info();
    },

    more_output: async (id) => {
      return getExistingKernel().more_output(id);
    },

    complete: async (opts) => {
      return await getExistingKernel().complete(get_code_and_cursor_pos(opts));
    },

    introspect: async (opts) => {
      const { code, cursor_pos } = get_code_and_cursor_pos(opts);
      let detail_level = 0;
      if (opts.level != null) {
        try {
          detail_level = parseInt(opts.level);
          if (detail_level < 0) {
            detail_level = 0;
          } else if (detail_level > 1) {
            detail_level = 1;
          }
        } catch (err) {}
      }
      return await getExistingKernel().introspect({
        code,
        cursor_pos,
        detail_level,
      });
    },
    store: async ({
      key,
      value,
    }: {
      key: string;
      value?: any;
    }): Promise<any> => {
      const kernel = getExistingKernel();
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
    },
    comm: async (opts) => {
      getExistingKernel().send_comm_message_to_kernel(opts);
    },

    ipywidgetsGetBuffer: async ({ model_id, buffer_path }) => {
      const buffer = getExistingKernel().ipywidgetsGetBuffer(
        model_id,
        buffer_path,
      );
      if (buffer == null) {
        throw Error(
          `no buffer for model=${model_id}, buffer_path=${JSON.stringify(
            buffer_path,
          )}`,
        );
      }
      return { buffer64: bufferToBase64(buffer) };
    },

  };
  return await createNatsJupyterService({
    project_id,
    path,
    impl,
  });
}

function get_code_and_cursor_pos(opts): {
  code: string;
  cursor_pos: number;
} {
  const code: string = opts.code;
  if (!code) {
    throw Error("must specify code");
  }
  let cursor_pos: number;
  if (opts.cursor_pos != null) {
    try {
      cursor_pos = parseInt(opts.cursor_pos);
    } catch (error) {
      cursor_pos = code.length;
    }
  } else {
    cursor_pos = code.length;
  }

  return { code, cursor_pos };
}
