/*
Code to change the working directory to a given directory in
several different languages.
*/

export default function createChdirCommand(lang: string, path: string): string {
  // throws exception if don't know how.
  lang = lang.toLowerCase(); // xeus-cling is 'C++-17'
  if (lang == "sparql") {
    // there is no notion of current directory for sparql.
    return "";
  }
  if (lang.startsWith("python") || lang.startsWith("sage")) {
    return createPythonChangeDirectoryCode(path);
  } else if (lang == "r") {
    return createRChangeDirectoryCode(path);
  } else if (lang == "julia") {
    return createJuliaChangeDirectoryCode(path);
  } else if (lang == "octave" || lang == "matlab") {
    return createOctaveChangeDirectoryCode(path);
  } else if (lang == "javascript") {
    return createNodeChangeDirectoryCode(path);
  } else if (lang == "bash" || lang == "sh") {
    return createBashChangeDirectoryCommand(path);
  } else if (lang == "prolog") {
    return createPrologChangeDirectoryCode(path);
  } else if (lang == "c" || lang.startsWith("c++")) {
    return createCppChangeDirectoryCode(path);
  } else {
    // e.g., "gap" -- I got stumped on that.
    throw Error(
      `unable to change directory: chdir for language ${lang} is not implemented.`
    );
  }
}

// mostly written by ChatGPT4
function createPythonChangeDirectoryCode(path: string): string {
  const escapedPath = path.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `import os; os.chdir('${escapedPath}')`;
}

function createRChangeDirectoryCode(path) {
  const escapedPath = path.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `setwd("${escapedPath}")`;
}

function createJuliaChangeDirectoryCode(path) {
  const escapedPath = path.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `cd("${escapedPath}")`;
}

function createOctaveChangeDirectoryCode(path) {
  const escapedPath = path.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `cd('${escapedPath}')`;
}

function createNodeChangeDirectoryCode(path) {
  const escapedPath = path.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
  return `process.chdir(\`${escapedPath}\`)`;
}

export function escapeBashChangeDirPath(path: string): string {
  return path.replace(/(["'$`\\])/g, "\\$1");
}

function createBashChangeDirectoryCommand(path) {
  const escapedPath = escapeBashChangeDirPath(path);
  return `cd '${escapedPath}'`;
}

/*
function createGAPChangeDirectoryCode(path) {
  const escapedPath = path.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  // SetCurrentDirectory doesn't exist.  ChatGPT made it up from C#.
  // I studied gap docs and googled for quite a while and was totally
  // stumped! Make this just isn't possible in gap...
  return `SetCurrentDirectory(Directory("${escapedPath}"));;`;
}
*/

function createPrologChangeDirectoryCode(path) {
  const escapedPath = path.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `working_directory(_, '${escapedPath}').`;
}

function createCppChangeDirectoryCode(path) {
  const escapedPath = path.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `#include <unistd.h>\nchdir("${escapedPath}")\n`;
}
