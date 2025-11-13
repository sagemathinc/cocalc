/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export function download_data(filename, data, type = "text/json") {
  const blob = new Blob([data], { type });
  if (typeof window.navigator["msSaveBlob"] == "function") {
    window.navigator["msSaveBlob"](blob, filename);
  } else {
    const elem = window.document.createElement("a");
    elem.href = window.URL.createObjectURL(blob);
    elem.download = filename;
    document.body.appendChild(elem);
    elem.click();
    document.body.removeChild(elem);
  }
}
