/*
Frame for showing the notebook as a slideshow for presentations.

TODO:
 - [ ] update button
 - [ ] save the exact page being viewed; can be done via [iframe ref].contentDocument.URL
       and looking at the number after the slash.
 - [ ] presentation mode that makes it genuine fullscreen -- builtin "F" command *just works*,
       so even a button to cause the same would be more than enough.
 - [ ] ability to customize the compilation command.       
*/

import { React, Rendered, Component } from "../../../app-framework";

interface Props {
  project_id: string;
  path: string;
  font_size: number;
}

export class Slideshow extends Component<Props, {}> {
  render(): Rendered {
    return <iframe width="100%" height="100%" src="https://cocalc.com/107dcdce-4222-41a7-88a1-7652e29c1159/port/54145/937d4dbc-2436-4abe-a057-65c9c03044b8/raw/.slideshow.slides.html" />;
  }
}
