/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// I think the extensions are all used to support Sage worksheets...

import * as CodeMirror from "codemirror";
import { defaults, required } from "smc-util/misc";
import { IS_MOBILE } from "../../feature";
declare var $;

// Apply a CodeMirror changeObj to this editing buffer.
CodeMirror.defineExtension("apply_changeObj", function (changeObj) {
  // @ts-ignore
  const editor = this;
  editor.replaceRange(changeObj.text, changeObj.from, changeObj.to);
  if (changeObj.next != null) {
    return editor.apply_changeObj(changeObj.next);
  }
});

// This is an improved rewrite of simple-hint.js from the CodeMirror3 distribution.
// It is used only by sage worksheets and nothing else, currently.
CodeMirror.defineExtension("showCompletions", function (opts: {
  from: CodeMirror.Position;
  to: CodeMirror.Position;
  completions: string[];
  target: string;
  completions_size?: number;
}): void {
  const { from, to, completions, target, completions_size } = defaults(opts, {
    from: required,
    to: required,
    completions: required,
    target: required,
    completions_size: 20,
  });

  if (completions.length === 0) {
    return;
  }

  // @ts-ignore
  const editor = this;
  const start_cursor_pos = editor.getCursor();
  const insert = function (str: string): void {
    const pos = editor.getCursor();
    from.line = pos.line;
    to.line = pos.line;
    const shift = pos.ch - start_cursor_pos.ch;
    from.ch += shift;
    to.ch += shift;
    editor.replaceRange(str, from, to);
  };

  if (completions.length === 1) {
    // do not include target in appended completion if it has a '*'
    if (target.indexOf("*") === -1) {
      insert(target + completions[0]);
    } else {
      insert(completions[0]);
    }
    return;
  }

  const sel = $("<select>").css("width", "auto");
  const complete = $("<div>").addClass("webapp-completions").append(sel);
  for (let c of completions) {
    // do not include target in appended completion if it has a '*'
    if (target.indexOf("*") === -1) {
      sel.append($("<option>").text(target + c));
    } else {
      sel.append($("<option>").text(c));
    }
  }
  sel.find(":first").attr("selected", true);
  sel.attr("size", Math.min(completions_size, completions.length));
  const pos = editor.cursorCoords(from);

  complete.css({
    left: pos.left + "px",
    top: pos.bottom + "px",
  });
  $("body").append(complete);
  // If we're at the edge of the screen, then we want the menu to appear on the left of the cursor.
  const winW =
    window.innerWidth ||
    Math.max(document.body.offsetWidth, document.documentElement.offsetWidth);
  if (winW - pos.left < sel.attr("clientWidth")) {
    complete.css({ left: pos.left - sel.attr("clientWidth") + "px" });
  }
  // Hide scrollbar
  if (completions.length <= completions_size) {
    complete.css({ width: sel.attr("clientWidth") - 1 + "px" });
  }

  let done = false;

  const close = function () {
    if (done) {
      return;
    }
    done = true;
    complete.remove();
  };

  const pick = function () {
    insert(sel.val());
    close();
    if (!IS_MOBILE) {
      return setTimeout(() => editor.focus(), 50);
    }
  };

  sel.blur(pick);
  sel.dblclick(pick);
  if (!IS_MOBILE) {
    // do not do this on mobile, since it makes it unusable!
    sel.click(pick);
  }
  sel.keydown(function (event) {
    const code = event.keyCode;
    switch (code) {
      case 13: // enter
        pick();
        return false;
      case 27:
        close();
        that.focus();
        return false;
      default:
        if (
          code !== 38 &&
          code !== 40 &&
          code !== 33 &&
          code !== 34 &&
          !CodeMirror.isModifierKey(event)
        ) {
          close();
          editor.focus();
          // Pass to CodeMirror (e.g., backspace)
          return editor.triggerOnKeyDown(event);
        }
    }
  });
  sel.focus();
});

function get_inspect_dialog(editor) {
  const dialog = $(`\
<div class="webapp-codemirror-introspect modal"
     data-backdrop="static" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog" style="width:90%">
        <div class="modal-content">
            <div class="modal-header">
                <button type="button" class="close" aria-hidden="true">
                    <span style="font-size:20pt;">×</span>
                </button>
                <h4><div class="webapp-codemirror-introspect-title"></div></h4>
            </div>

            <div class="webapp-codemirror-introspect-content-source-code cm-s-default">
            </div>
            <div class="webapp-codemirror-introspect-content-docstring cm-s-default">
            </div>


            <div class="modal-footer">
                <button class="btn btn-close btn-default">Close</button>
            </div>
        </div>
    </div>
</div>\
`);
  dialog.modal();
  dialog.data("editor", editor);

  dialog.find("button").click(function () {
    dialog.modal("hide");
    dialog.remove(); // also remove; we no longer have any use for this element!
  });

  // see http://stackoverflow.com/questions/8363802/bind-a-function-to-twitter-bootstrap-modal-close
  dialog.on("hidden.bs.modal", function () {
    dialog.data("editor").focus?.();
    dialog.data("editor", 0);
  });

  return dialog;
}

CodeMirror.defineExtension("showIntrospect", function (opts: {
  from: CodeMirror.Position;
  content: string;
  type: string;
  target: string;
}): void {
  opts = defaults(opts, {
    from: required,
    content: required,
    type: required, // 'docstring', 'source-code' -- FUTURE:
    target: required,
  });
  // @ts-ignore
  const editor = this;
  if (typeof opts.content !== "string") {
    // If for some reason the content isn't a string (e.g., undefined or an object or something else),
    // convert it a string, which will display fine.
    opts.content = `${JSON.stringify(opts.content)}`;
  }
  const element = get_inspect_dialog(editor);
  element.find(".webapp-codemirror-introspect-title").text(opts.target);
  element.show();
  let elt;
  if (opts.type === "source-code") {
    elt = element.find(".webapp-codemirror-introspect-content-source-code")[0];
    if (elt != null) {
      // see https://github.com/sagemathinc/cocalc/issues/1993
      CodeMirror.runMode(opts.content, "python", elt);
    }
  } else {
    elt = element.find(".webapp-codemirror-introspect-content-docstring")[0];
    if (elt != null) {
      // see https://github.com/sagemathinc/cocalc/issues/1993
      CodeMirror.runMode(opts.content, "text/x-rst", elt);
    }
  }
});
