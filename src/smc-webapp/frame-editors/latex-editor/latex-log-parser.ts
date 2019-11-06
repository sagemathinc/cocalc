// This is derived from https://github.com/sharelatex/latex-log-parser-sharelatex
// commit: 7301857ac402ff5491cb219d9415ac41b19e7e43
// incorporating fix for https://github.com/sharelatex/latex-log-parser-sharelatex/issues/5 by HSY
// License: MIT

// Define some constants
const LOG_WRAP_LIMIT = 79;
const LATEX_WARNING_REGEX = /^LaTeX Warning: (.*)$/;
const HBOX_WARNING_REGEX = /^(Over|Under)full \\(v|h)box/;
const PACKAGE_WARNING_REGEX = /^(Package \b.+\b Warning:.*)$/;
// This is used to parse the line number from common latex warnings
const LINES_REGEX = /lines? ([0-9]+)/;
// This is used to parse the package name from the package warnings
const PACKAGE_REGEX = /^Package (\b.+\b) Warning/;

class LogText {
  private lines: string[];
  private row: number;
  constructor(text: string) {
    text = text.replace(/(\r\n)|\r/g, "\n");
    // Join any lines which look like they have wrapped.
    const wrappedLines = text.split("\n");
    this.lines = [wrappedLines[0]];
    let i = 1;
    while (i < wrappedLines.length) {
      // If the previous line is as long as the wrap limit then
      // append this line to it.
      // Some lines end with ... when LaTeX knows it's hit the limit
      // These shouldn't be wrapped.
      if (
        wrappedLines[i - 1].length === LOG_WRAP_LIMIT &&
        wrappedLines[i - 1].slice(-3) !== "..."
      ) {
        this.lines[this.lines.length - 1] += wrappedLines[i];
      } else {
        this.lines.push(wrappedLines[i]);
      }
      i++;
    }
    this.row = 0;
  }

  nextLine(): string | null {
    this.row++;
    if (this.row >= this.lines.length) {
      return null;
    } else {
      return this.lines[this.row];
    }
  }

  rewindLine() {
    this.row--;
  }

  linesUpToNextWhitespaceLine() {
    return this.linesUpToNextMatchingLine(/^ *$/);
  }

  linesUpToNextMatchingLine(match) {
    const lines: string[] = [];
    let nextLine: string | null = this.nextLine();
    if (nextLine != null) {
      lines.push(nextLine);
    }
    while (nextLine != null && !nextLine.match(match)) {
      nextLine = this.nextLine();
      if (nextLine != null) {
        lines.push(nextLine);
      }
    }
    return lines;
  }
}

const state = {
  NORMAL: 0,
  ERROR: 1
};

/* Type of an error or warning */
export interface Error {
  line: number | null;
  file: string;
  level: string;
  message: string;
  content?: string;
  raw: string;
}

interface File {
  path: string;
  files: string[];
}

export interface IProcessedLatexLog {
  errors: Error[];
  warnings: Error[];
  typesetting: Error[];
  all: Error[];
  files: string[];
}

export class ProcessedLatexLog implements IProcessedLatexLog {
  errors: Error[] = [];
  warnings: Error[] = [];
  typesetting: Error[] = [];
  all: Error[] = [];
  files: string[] = [];

  toJS(): IProcessedLatexLog {
    return Object.assign({}, this);
  }
}

export class LatexParser {
  private log: any;
  private state: number;
  private ignoreDuplicates: boolean;
  private currentError: Error;
  private data: Error[];
  private fileStack: File[];
  private rootFileList: string[];
  private openParens: number;
  private currentLine: string;
  private currentFilePath: string;
  private files: Set<string> = new Set([]);

  constructor(text, options) {
    this.log = new LogText(text);
    this.state = state.NORMAL;
    options = options || {};
    this.ignoreDuplicates = options.ignoreDuplicates;
    this.data = [];
    this.fileStack = [];
    this.rootFileList = [];
    this.openParens = 0;
  }

  parse(): IProcessedLatexLog {
    while ((this.currentLine = this.log.nextLine()) != null) {
      if (this.state === state.NORMAL) {
        if (this.currentLineIsError()) {
          this.state = state.ERROR;
          this.currentError = {
            line: null,
            file: this.currentFilePath,
            level: "error",
            message: this.currentLine.slice(2),
            content: "",
            raw: this.currentLine + "\n"
          };
        } else if (this.currentLineIsRunawayArgument()) {
          this.parseRunawayArgumentError();
        } else if (this.currentLineIsWarning()) {
          this.parseSingleWarningLine(LATEX_WARNING_REGEX);
        } else if (this.currentLineIsHboxWarning()) {
          this.parseHboxLine();
        } else if (this.currentLineIsPackageWarning()) {
          this.parseMultipleWarningLine();
        } else {
          this.parseParensForFilenames();
        }
      }
      if (this.state === state.ERROR) {
        this.currentError.content += this.log
          .linesUpToNextMatchingLine(/^l\.[0-9]+/)
          .join("\n");
        this.currentError.content += "\n";
        this.currentError.raw += this.currentError.content;
        const lineNo = this.currentError.raw.match(/l\.([0-9]+)/);
        if (lineNo) {
          this.currentError.line = parseInt(lineNo[1], 10);
        }
        this.data.push(this.currentError);
        this.state = state.NORMAL;
      }
    }
    return this.postProcess(this.data).toJS();
  }

  currentLineIsError(): boolean {
    return this.currentLine[0] === "!";
  }

  currentLineIsRunawayArgument(): boolean {
    return !!this.currentLine.match(/^Runaway argument/);
  }

  currentLineIsWarning(): boolean {
    return !!this.currentLine.match(LATEX_WARNING_REGEX);
  }

  currentLineIsPackageWarning(): boolean {
    return !!this.currentLine.match(PACKAGE_WARNING_REGEX);
  }

  currentLineIsHboxWarning(): boolean {
    return !!this.currentLine.match(HBOX_WARNING_REGEX);
  }

  parseRunawayArgumentError(): void {
    this.currentError = {
      line: null,
      file: this.currentFilePath,
      level: "error",
      message: this.currentLine,
      content: "",
      raw: this.currentLine + "\n"
    };
    this.currentError.content += this.log
      .linesUpToNextWhitespaceLine()
      .join("\n");
    this.currentError.content += "\n";
    this.currentError.content += this.log
      .linesUpToNextWhitespaceLine()
      .join("\n");
    this.currentError.raw += this.currentError.content;
    const lineNo = this.currentError.raw.match(/l\.([0-9]+)/);
    if (lineNo) {
      this.currentError.line = parseInt(lineNo[1], 10);
    }
    this.data.push(this.currentError);
  }

  parseSingleWarningLine(prefix_regex): void {
    const warningMatch = this.currentLine.match(prefix_regex);
    if (!warningMatch) {
      return;
    }
    const warning = warningMatch[1];
    const lineMatch = warning.match(LINES_REGEX);
    const line = lineMatch ? parseInt(lineMatch[1], 10) : null;
    this.data.push({
      line,
      file: this.currentFilePath,
      level: "warning",
      message: warning,
      raw: warning
    });
  }

  parseMultipleWarningLine(): void {
    // Some package warnings are multiple lines, let's parse the first line
    let warningMatch = this.currentLine.match(PACKAGE_WARNING_REGEX);
    if (!warningMatch) return;
    const warning_lines = [warningMatch[1]];
    let lineMatch = this.currentLine.match(LINES_REGEX);
    let line = lineMatch ? parseInt(lineMatch[1], 10) : null;
    const packageMatch = this.currentLine.match(PACKAGE_REGEX);
    if (!packageMatch) return;
    const packageName = packageMatch[1];
    // Regex to get rid of the unnecesary (packagename) prefix in most multi-line warnings
    const prefixRegex = new RegExp(`(?:\\(${packageName}\\))*[\\s]*(.*)`, "i");
    // After every warning message there's a blank line, let's use it
    while (!!(this.currentLine = this.log.nextLine())) {
      lineMatch = this.currentLine.match(LINES_REGEX);
      line = lineMatch ? parseInt(lineMatch[1], 10) : line;
      warningMatch = this.currentLine.match(prefixRegex);
      if (warningMatch) {
        warning_lines.push(warningMatch[1]);
      }
    }
    const raw_message = warning_lines.join(" ");
    this.data.push({
      line,
      file: this.currentFilePath,
      level: "warning",
      message: raw_message,
      raw: raw_message
    });
  }

  parseHboxLine() {
    const lineMatch = this.currentLine.match(LINES_REGEX);
    const line = lineMatch ? parseInt(lineMatch[1], 10) : null;
    this.data.push({
      line,
      file: this.currentFilePath,
      level: "typesetting",
      message: this.currentLine,
      raw: this.currentLine
    });
  }

  // Check if we're entering or leaving a new file in this line
  parseParensForFilenames(): void {
    const pos = this.currentLine.search(/\(|\)/);
    if (pos !== -1) {
      const token = this.currentLine[pos];
      this.currentLine = this.currentLine.slice(pos + 1);
      if (token === "(") {
        const filePath = this.consumeFilePath();
        if (filePath) {
          this.currentFilePath = filePath;
          const newFile: File = {
            path: filePath,
            files: []
          };
          this.fileStack.push(newFile);
          this.files.add(filePath);

          if (this.rootFileList.length == 0) {
            // this happens only once.
            this.rootFileList = newFile.files;
          }
        } else {
          this.openParens++;
        }
      } else if (token === ")") {
        if (this.openParens > 0) {
          this.openParens--;
        } else {
          if (this.fileStack.length > 1) {
            this.fileStack.pop();
            const previousFile = this.fileStack[this.fileStack.length - 1];
            this.currentFilePath = previousFile.path;
          }
        }
      }
      // else {
      //		 Something has gone wrong but all we can do now is ignore it :(
      // }
      // Process the rest of the line
      this.parseParensForFilenames();
    }
  }

  consumeFilePath(): string | null {
    // Our heuristic for detecting file names are rather crude
    // A file may not contain a space, or ) in it
    // To be a file path it must have at least one /
    // hsy: slight enhancement: search until ")" or EOL, and then trim the string
    if (!this.currentLine.match(/^\/?([^ \)]+\/)+/)) {
      return null;
    }
    const trimEnd = require("lodash/trimEnd");
    const endOfFilePath = trimEnd(this.currentLine.search(RegExp("$|\\)")));
    let path: string;
    if (endOfFilePath === -1) {
      path = this.currentLine;
      this.currentLine = "";
    } else {
      path = this.currentLine.slice(0, endOfFilePath);
      this.currentLine = this.currentLine.slice(endOfFilePath);
    }
    //if DEBUG
    //    console.log("latex-log-parser@consumeFilePath", @currentLine, "endOfFilePath:", endOfFilePath, "-> path: '#{path}'")
    return path;
  }

  postProcess(data: Error[]): ProcessedLatexLog {
    const pll = new ProcessedLatexLog();
    for (const path of this.files) {
      if (path.indexOf(" [") != -1) continue; // HACK: sometimes this gets miss-parsed....
      if (path.indexOf(" (") != -1) continue; // HACK...
      if (path.indexOf("\\") != -1) continue; // .
      if (path.endsWith(".aux")) continue; // do not include this.
      pll.files.push(path);
    }
    const hashes: string[] = [];
    const hashEntry: Function = entry => entry.raw;

    let i: number = 0;
    while (i < data.length) {
      if (this.ignoreDuplicates && hashes.indexOf(hashEntry(data[i])) > -1) {
        i++;
        continue;
      }
      if (data[i].level === "error") {
        pll.errors.push(data[i]);
      } else if (data[i].level === "typesetting") {
        pll.typesetting.push(data[i]);
      } else if (data[i].level === "warning") {
        pll.warnings.push(data[i]);
      }
      pll.all.push(data[i]);
      hashes.push(hashEntry(data[i]));
      i++;
    }
    return pll;
  }
}
