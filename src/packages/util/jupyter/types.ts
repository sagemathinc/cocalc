export type CellType = "raw" | "markdown" | "code"; // | "multi"; // multi isn't used

export interface NbconvertParams {
  args: string[];
  directory?: string;
  timeout?: number; // in seconds!
}

interface HelpLink {
  text: string;
  url: string;
}

interface CodeMirrorMode {
  name: string;
  version: number;
}

interface LanguageInfo {
  name: string;
  version: string;
  mimetype: string;
  codemirror_mode: CodeMirrorMode;
  pygments_lexer: string;
  nbconvert_exporter: string;
  file_extension: string;
}

export interface KernelInfo {
  nodejs_version: string;
  start_time: number;
  implementation_version: string;
  banner: string;
  protocol_version: string;
  implementation: string;
  status: string;
  language_info: LanguageInfo;
  help_links: HelpLink[];
}

export interface KernelSpec {
  name: string;
  display_name: string;
  language: string;
  interrupt_mode: string; // usually "signal"
  env: { [key: string]: string }; // usually {}
  metadata?: KernelMetadata;
  resource_dir: string;
  argv: string[]; // comamnd+args, how the kernel will be launched
}

export type KernelMetadata = {
  // top level could contain a "cocalc" key, containing special settings understood by cocalc
  cocalc?: {
    priority?: number; // level 10 means it is important, on short list of choices, etc. 1 is low priority, for older versions
    description: string; // Explains what the kernel is, eventually visible to the user
    url: string; // a link to a website with more info about the kernel
  } & {
    // nested string/string key/value dictionary
    [key: string]: string | Record<string, string>;
  };
};
