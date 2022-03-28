export type LanguageName = "python" | "R" | "octave" | "julia";

export type SoftwareSpec = {
  [lang in LanguageName]: {
    [name: string]: { cmd: string; name: string; doc: string; url: string };
  };
};

export interface Item {
  index: number;
  name: string;
  key: string;
  url?: string;
  summary?: string;
  search: string;

  // NOTE: the keys below are just examples.
  // Use what's stored for each language in the SPEC mapping
  python3?: string;
  sage?: string;
  anaconda?: string;
  python2?: string;

  R?: string;
  "sage -R"?: string;

  octave?: string;

  julia?: string;
}

export type ComputeInventory = {
  language_exes: {
    [path: string]: {
      lang: string;
      name: string;
      doc: string;
      url: string;
    };
  };
} & {
  executables: {
    // record the "--help" or "--version" output of each executable
    [path: string]: string;
  };
} & {
  [lang in LanguageName]: {
    // for each path, a map of package names to version number
    [path: string]: { [pkgName: string]: string } | null;
  };
};

export type ComputeComponents = {
  [lang in LanguageName]: {
    [name: string]: {
      name: string;
      url: string;
      descr?: string;
      summary?: string;
    } | null;
  };
} & {
  executables: {
    // in the future, we might have all info field for executables (like above) as well
    [path: string]: { name: string };
  };
};
