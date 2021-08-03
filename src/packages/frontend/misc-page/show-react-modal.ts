/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { callback } from "awaiting";
import { ReactDOM } from "../app-framework";
declare var $: any;

/*
Show a modal defined in React somehow completely outside of any
react specific rendering.  E.g., we use this in a codemirror plugin
that doesn't know anything about the react page.

The function show_react_modal takes as input a function
that takes as input a callback, and calls that with a result
when the modal closes.  That result is then what

    await show_react_modal(...)

returns.  In particular, here is what a simple usage might look like:

import { Modal } from "antd";

await show_react_modal((cb) => {
    return (
      <Modal
        title="Basic Modal"
        visible={true}
        onOk={() => cb(undefined, "result")}
        onCancel={() => cb("cancel-showing exception is raised")}
      >
        <p>{default_display}</p>
        <p>{show_target}</p>
        <p>Some contents...</p>
      </Modal>
    );
  });
*/
export async function show_react_modal(
  modal_generator: (cb: (err?: any, result?: any) => void) => JSX.Element
): Promise<any> {
  const elt = $("<div></div>");
  $("body").append(elt);
  return await callback((cb) => {
    function call_on_close(err, result) {
      ReactDOM.unmountComponentAtNode(elt[0]);
      elt.remove();
      cb(err, result);
    }
    ReactDOM.render(modal_generator(call_on_close), elt[0]);
  });
}
