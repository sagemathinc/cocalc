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
    priority?: number; // 10+ = "Suggested"/starred; 1 = older version (still selectable); <0 = deprecated: still visible/selectable but excluded from closest_kernel_match and from update-detection candidates. To hide entirely use `disabled: true`.
    description?: string; // Explains what the kernel is, eventually visible to the user
    url?: string; // a link to a website with more info about the kernel
    disabled?: boolean; // if true, the kernel is hidden from the cocalc notebook UI
    // Versioned-kernel support: two kernels with the same "family" are the
    // same software line; "version" is a dotted numeric version (^\d+(\.\d+)*$)
    // used to detect that a newer version of the same family is available.
    family?: string;
    version?: string;
    display_version?: string; // optional human-readable version label
  };
};
