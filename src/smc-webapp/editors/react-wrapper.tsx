/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Wrapper in a React component of a non-react editor, so that we can fully rewrite
   the UI using React without having to rewrite all the editors.

   This should be used ONLY for sagews and jupyter classic and NOTHING ELSE.
   TODO: There are still some is_public editors, but we shouldn't use any of them.
*/

import { debounce } from "lodash";
import { delay } from "awaiting";
import { NotifyResize } from "../notify-resize/index";
import {
  React,
  ReactDOM,
  useAsyncEffect,
  useEffect,
  useRef,
} from "../app-framework";
import { copy } from "smc-util/misc";

const WrappedEditor: React.FC<{ editor: any }> = ({ editor }) => {
  const ref = useRef(null);

  // Refreshes -- cause the editor to resize itself
  function refresh() {
    if (editor.show == null) {
      typeof editor._show === "function" ? editor._show() : undefined;
    } else {
      editor.show();
    }
  }

  useAsyncEffect(
    // setup
    async (is_mounted) => {
      // We use this delay (and AsyncEffect) because otherwise Jupyter classic
      // gets stuck in "Loading...".  It has something to do with the iframe
      // trickiness.
      await delay(0);
      if (!is_mounted()) return;
      const elt = $(ReactDOM.findDOMNode(ref.current));
      if (elt.length > 0) {
        elt.replaceWith(editor.element[0]);
      }
      editor.show();
      if (typeof editor.focus === "function") {
        editor.focus();
      }
      if (typeof editor.restore_view_state === "function") {
        editor.restore_view_state();
      }
      window.addEventListener("resize", refresh);
    },
    () => {
      // clean up
      window.removeEventListener("resize", refresh);
      // These cover all cases for jQuery type overrides.
      if (typeof editor.save_view_state === "function") {
        editor.save_view_state();
      }
      if (typeof editor.blur === "function") {
        editor.blur();
      }
      editor.hide();
    },
    []
  );

  useEffect(refresh);

  // position relative is required by NotifyResize
  return (
    <div className="smc-vfill" style={{ position: "relative" }}>
      <NotifyResize onResize={debounce(refresh, 350)} />
      <span className="smc-editor-react-wrapper" ref={ref}></span>
    </div>
  );
};

// Used for caching
const editors = {};

function get_key(project_id: string, path: string): string {
  return `${project_id}-${path}`;
}

export function get_editor(project_id: string, path: string) {
  return editors[get_key(project_id, path)];
}

export function register_nonreact_editor(opts: {
  f: (project_id: string, filename: string, extra_opts: object) => any;
  ext: string | string[];
  icon?: string;
  is_public?: boolean;
}): void {
  // Circle import issue -- since editor imports react-wrapper:
  const { file_options } = require("../editor");
  const { register_file_editor } = require("../project_file");

  // We do this just to make it crystal clear which extensions still use non-react editors
  /* console.log("register_nonreact_editor", {
    ext: opts.ext,
    is_public: opts.is_public,
  });
  */

  register_file_editor({
    ext: opts.ext,
    is_public: opts.is_public,
    icon: opts.icon,
    init(path: string, _redux, project_id: string): string {
      const key = get_key(project_id, path);

      if (editors[key] == null) {
        // Overwrite functions called from the various file editors
        const extra_opts = copy(file_options(path)?.opts ?? {});
        const e = opts.f(project_id, path, extra_opts);
        editors[key] = e;
      }
      return key;
    },

    generator(
      path: string,
      _redux,
      project_id: string
    ): Function | JSX.Element {
      const key = get_key(project_id, path);
      const wrapper_generator = function () {
        if (editors[key] != null) {
          return <WrappedEditor editor={editors[key]} />;
        } else {
          // GitHub #4231 and #4232 -- sometimes the editor gets rendered
          // after it gets removed.  Presumably this is just for a moment, but
          // it's good to do something halfway sensible rather than hit a traceback in
          // this case...
          return <div>Please close then re-open this file.</div>;
        }
      };
      wrapper_generator.get_editor = () => editors[key];
      return wrapper_generator;
    },

    remove(path: string, _redux, project_id: string): void {
      const key = get_key(project_id, path);
      if (editors[key]) {
        editors[key].remove();
        delete editors[key];
      }
    },

    save(path: string, _redux, project_id: string): void {
      if (opts.is_public) {
        return;
      }
      const f = editors[get_key(project_id, path)]?.save;
      if (f != null) f();
    },
  });
}
