export interface Creds {
  readonly sitename: string;
  readonly url: string;
  readonly email: string;
  readonly passw: string;
  readonly project: string;
  readonly token?: string;
  readonly firstname?: string;
  readonly lastname?: string;
}

export interface Opts {
  headless?: string;
  screenshot?: string;
  path?: string | boolean;
  skip?: RegExp;
  xprj?: string;
}

export interface InstallOpts {
  install_folder: string;
  create_project: boolean;
  headless?: string;
  path?: string | boolean;
}

export const ExtChromePath: string = "/usr/bin/chromium-browser";

export class PassFail {
  pass: number;
  fail: number;
  skip: number;
  constructor(p: number = 0, f: number = 0, s: number = 0) {
    this.pass = p;
    this.fail = f;
    this.skip = s;
  }
  add(pf: PassFail): PassFail {
    this.pass += pf.pass;
    this.fail += pf.fail;
    this.skip += pf.skip;
    return this;
  }
}

export class ApiGetString extends PassFail {
  result: string;
  constructor() {
    super();
    this.result = "NONE";
  }
}

export const TestFiles: { [key: string]: string } = {
  texfile: "latex-sample.tex",
  widgetfile: "widgets-sample.ipynb",
  sageipynbfile: "sage-sample.ipynb"
};
