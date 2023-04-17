/*
Code to set an environment variable to a given value in
several different languages.
*/

export default function createSetEnvCommand(
  lang: string,
  varName: string,
  varValue: string
): string {
  // throws exception if don't know how.
  lang = lang.toLowerCase(); // xeus-cling is 'C++-17'
  if (lang == "sparql") {
    // there is no notion of environment variables for sparql.
    return "";
  }
  if (lang.startsWith("python") || lang.startsWith("sage")) {
    return createPythonSetEnvCode(varName, varValue);
  } else if (lang == "r") {
    return createRSetEnvCode(varName, varValue);
  } else if (lang == "julia") {
    return createJuliaSetEnvCode(varName, varValue);
  } else if (lang == "octave" || lang == "matlab") {
    return createOctaveSetEnvCode(varName, varValue);
  } else if (lang == "javascript") {
    return createNodeSetEnvCode(varName, varValue);
  } else if (lang == "bash" || lang == "sh") {
    return createBashSetEnvCommand(varName, varValue);
  } else if (lang == "prolog") {
    return createPrologSetEnvCode(varName, varValue);
  } else if (lang == "c" || lang.startsWith("c++")) {
    return createCppSetEnvCode(varName, varValue);
  } else {
    // e.g., "gap" -- I didn't try.
    throw Error(
      `unable to set environment variable: ${varName} for language ${lang} is not implemented.`
    );
  }
}

// mostly written by ChatGPT4
function createPythonSetEnvCode(varName: string, varValue: string): string {
  const escapedVarName = varName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const escapedVarValue = varValue.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `import os; os.environ['${escapedVarName}'] = '${escapedVarValue}'`;
}

function createRSetEnvCode(varName: string, varValue: string): string {
  const escapedVarName = varName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedVarValue = varValue.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `Sys.setenv("${escapedVarName}"="${escapedVarValue}")`;
}

function createJuliaSetEnvCode(varName: string, varValue: string): string {
  const escapedVarName = varName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedVarValue = varValue.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `ENV["${escapedVarName}"] = "${escapedVarValue}"`;
}

function createOctaveSetEnvCode(varName: string, varValue: string): string {
  const escapedVarName = varName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const escapedVarValue = varValue.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `setenv('${escapedVarName}','${escapedVarValue}')`;
}

function createNodeSetEnvCode(varName: string, varValue: string): string {
  const escapedVarName = varName.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
  const escapedVarValue = varValue.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
  return `process.env.${escapedVarName} = \`${escapedVarValue}\``;
}

function createBashSetEnvCommand(varName: string, varValue: string): string {
  const escapedVarName = varName.replace(/(["'$`\\])/g, "\\$1");
  const escapedVarValue = varValue.replace(/(["'$`\\])/g, "\\$1");
  return `${escapedVarName}="${escapedVarValue}"`;
}

function createPrologSetEnvCode(varName: string, varValue: string): string {
  const escapedVarName = varName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const escapedVarValue = varValue.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `setenv('${escapedVarName}', '${escapedVarValue}').`;
}

function createCppSetEnvCode(varName: string, varValue: string): string {
  const escapedVarName = varName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedVarValue = varValue.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `#include <cstdlib>\nstd::putenv("${escapedVarName}=${escapedVarValue}")\n`;
}
