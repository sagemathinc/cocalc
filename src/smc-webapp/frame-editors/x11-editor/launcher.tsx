/*
X11 Window frame.
*/

import { React, Component, Rendered } from "../../app-framework";

import { debounce, keys } from "underscore";

const { Button } = require("react-bootstrap");
const { Icon } = require("r_misc");

import { Actions } from "./actions";

const DESC = {
  /* xclock: { icon: "clock", desc:"Shows UTC time" }, */
  emacs: {
    icon: "edit",
    desc: "An extensible, customizable, text editor — and more.",
    label: "Emacs"
  },
  gvim: { icon: "edit", desc: "The ubiquitous text editor", label: "Vim" },
  inkscape: {
    icon: "pen-fancy",
    desc: "Vector graphics editor",
    label: "Inkscape"
  },
  gimp: { icon: "pen", desc: "Image editing", label: "GIMP" },
  krita: { icon: "pen", desc: "Image editing", label: "Krita" },
  vscode: {
    label: "VS Code",
    command: "code",
    icon: "code",
    desc: "Visual Studio code"
  },
  terminal: {
    label: "Terminal",
    command: "gnome-terminal",
    icon: "terminal",
    desc: "Command line terminal"
  },
  gitk: { icon: "git", desc: "Explore Git repository in current directory" },
  idle: {
    icon: "cc-icon-python",
    desc: "Minimalistic Python IDE",
    label: "IDLE"
  },
  okular: {
    icon: "file-pdf",
    desc: "PDF reader and annotator (Tools → Review)",
    label: "Okular"
  },
  libreoffice: {
    icon: "file-alt",
    desc:
      "A powerful office suite (spreadsheet, word processor, presentations, etc. -- open Word, Excel, Powerpoint, etc.)",
    label: "LibreOffice"
  },
  nteract: {
    command: "nteract",
    icon: "cube",
    desc: "A desktop Jupyter Notebook Client",
    label: "nteract"
  },
  wxmaxima: {
    icon: "shapes",
    desc: "A legendary computer algebra system",
    label: "Maxima"
  },
  rstudio: {
    icon: "cc-icon-r",
    desc:
      "An integrated development environment (IDE) for R.  RStudio, Inc. is in no way affiliated with CoCalc",
    label: "RStudio"
  },
  /* octave: {
    icon: "cubes",
    desc: "Scientific programming largely compatible with Matlab",
    label: "Octave"
  },*/
  texmacs: {
    icon: "cc-icon-tex-file",
    desc:
      "A wysiwyw (what you see is what you want) editing platform with special features for scientists",
    label: "TeXMacs"
  },
  texstudio: {
    icon: "cc-icon-tex-file",
    desc: "An integrated writing environment for creating LaTeX documents",
    label: "TeXstudio"
  }
};

const APPS: string[] = keys(DESC);
APPS.sort();

interface Props {
  actions: Actions;
}

export class Launcher extends Component<Props, {}> {
  static displayName = "X11 Launcher";

  constructor(props) {
    super(props);
    this.launch = debounce(this.launch.bind(this), 500, true);
  }

  shouldComponentUpdate(): boolean {
    return false;
  }

  launch(app: string): void {
    const desc = DESC[app];
    if (desc == null) {
      return;
    }
    this.props.actions.launch(desc.command ? desc.command : app, desc.args);
  }

  render_launcher(app: string): Rendered {
    const desc = DESC[app];
    if (desc == null) {
      return;
    }
    let icon: Rendered = undefined;
    if (desc.icon != null) {
      icon = <Icon name={desc.icon} style={{ marginRight: "5px" }} />;
    }

    return (
      <Button key={app} onClick={() => this.launch(app)} title={desc.desc}>
        {icon}
        {desc.label ? desc.label : app}
      </Button>
    );
  }

  render_launchers(): Rendered[] {
    const v: Rendered[] = [];
    for (let app of APPS) {
      v.push(this.render_launcher(app));
    }
    return v;
  }

  render(): Rendered {
    return (
      <div style={{ overflowY: "auto", margin: "5px" }}>
        {this.render_launchers()}
      </div>
    );
  }
}
