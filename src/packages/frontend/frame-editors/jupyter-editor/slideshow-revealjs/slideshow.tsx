/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Frame for showing the notebook as a slideshow for presentations.

TODO:
 - [ ] Clicking on the slideshow iframe should focus that frame... if possible.
 - [ ] save the exact page being viewed; can be done via [iframe ref].contentDocument.URL
       and looking at the number after the slash.
 - [ ] presentation mode that makes it genuine fullscreen -- builtin "F" command *just works*,
       so even a button to cause the same would be more than enough.
 - [ ] some key shortcuts (? for help, f for fullscreen)
 - [ ] ability to customize the compilation command.
 - [ ] progress bar based on last build time.
 - [ ] support something like RISE, i.e., live functionality (?) -- https://github.com/damianavila/RISE
*/

import { delay } from "awaiting";

import {
  React,
  Rendered,
  Component,
  rclass,
  rtypes,
} from "../../../app-framework";

import { Loading } from "../../../r_misc";

import { Map } from "immutable";

import { JupyterEditorActions } from "../actions";

interface Props {
  actions: JupyterEditorActions;
  // reduxProps:
  slideshow?: Map<string, string>;
}

class Slideshow extends Component<Props, {}> {
  static reduxProps({ name }) {
    return {
      [name]: {
        slideshow: rtypes.immutable.Map,
      },
    };
  }

  private render_iframe(): Rendered {
    if (this.props.slideshow == null) return;
    return (
      <iframe
        width="100%"
        height="100%"
        src={this.props.slideshow.get("url")}
      />
    );
  }

  private render_loading(): Rendered {
    return (
      <div style={{ textAlign: "center" }}>
        <Loading theme="medium" />
      </div>
    );
  }

  private render_building(): Rendered {
    return (
      <div>
        <h3 style={{ textAlign: "center", color: "#666" }}>
          Creating slideshow using nbconvert...
        </h3>
      </div>
    );
    // TODO: this would be a good place to draw a progress bar.
  }

  private async launch_build(): Promise<void> {
    // must not happen in render loop, but fine if it happens even after
    // this component unmounts.
    await delay(0);
    if (this.props.actions != null) {
      this.props.actions.build_revealjs_slideshow();
    }
  }

  render(): Rendered {
    if (this.props.slideshow == null) {
      this.launch_build();
      return this.render_loading();
    }
    if (this.props.slideshow.get("state") == "building") {
      return this.render_building();
    }
    if (this.props.slideshow.get("state") == "built") {
      return this.render_iframe();
    }
    this.launch_build();
    return this.render_loading();
  }
}

const tmp = rclass(Slideshow);
export { tmp as Slideshow };
