/*


DEVELOPMENT:

Go to packages/project/c/open-files.ts and for a dev project, stop the built in open files service
and start your own in a terminal.  If you then open a jupyter notebook in that project, you can use
your terminal running the open files service to interact with anything here from the server size.
In particular, set global.x = ..., etc.
*/

import { createConatJupyterService } from "@cocalc/conat/service/jupyter";
import { kernels } from "./kernels";
import { bufferToBase64 } from "@cocalc/util/base64";
import { once } from "@cocalc/util/async-utils";
import { type JupyterKernel } from "./kernel";

export async function initConatService({
  path,
  project_id,
  timeout = 15000, // used for getKernel right now
}: {
  path: string;
  project_id: string;
  timeout?: number;
}) {
  const getExistingKernel = async (): Promise<JupyterKernel> => {
    let kernel = kernels.get(path);
    if (kernel != null) {
      return kernel;
    }
    try {
      [kernel] = await once(kernels, path, timeout);
      return kernel!;
    } catch {}
    // timeout
    // it doesn't exist right now, but it probably will in a few seconds, so wait
    // in an event driven way for it to get opened.

    throw Error(`no Jupyter kernel with path '${path}'`);
  };

  const impl = {
    // Signal should be a string like "SIGINT", "SIGKILL".
    signal: async (signal: string) => {
      kernels.get(path)?.signal(signal);
    },

    save_ipynb_file: async (opts?) => {
      await (await getExistingKernel()).save_ipynb_file(opts);
    },

    kernel_info: async () => {
      return await (await getExistingKernel()).kernel_info();
    },

    more_output: async (id) => {
      return (await getExistingKernel()).more_output(id);
    },

    complete: async (opts) => {
      return await (
        await getExistingKernel()
      ).complete(get_code_and_cursor_pos(opts));
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
      return await (
        await getExistingKernel()
      ).introspect({
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
      const kernel = await getExistingKernel();
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
      (await getExistingKernel()).sendCommMessageToKernel(opts);
    },

    ipywidgetsGetBuffer: async ({ model_id, buffer_path }) => {
      const buffer = (await getExistingKernel()).ipywidgetsGetBuffer(
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
  return await createConatJupyterService({
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
