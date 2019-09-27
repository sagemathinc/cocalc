export interface Creds {
  readonly sitename: string;
  readonly url: string;
  readonly email: string;
  readonly passw: string;
  readonly project: string;
  readonly texfile: string;
  readonly widgetfile: string;
  readonly sageipynbfile: string;
  readonly sagewsfile: string;
}

export interface Opts {
  headless?: string;
  screenshot?: string;
  path?: string|boolean;
  skip?: RegExp;
}

export class PassFail {
  pass: number;
  fail: number;
  constructor(p: number = 0, f: number = 0) { this.pass = p; this.fail = f }
  add (pf: PassFail): PassFail {
    this.pass += pf.pass;
    this.fail += pf.fail;
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