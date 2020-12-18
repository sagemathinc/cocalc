/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";
import { Button, Modal } from "antd";
import { React } from "../../app-framework";
import { alert_message } from "../../alerts";
import { show_react_modal } from "../../misc-page";

interface Options {
  char: string; // utf8 representation of the symbol
  code: string; // html code for the symbol
}

async function get_insert_special_char_from_user(): Promise<
  undefined | Options
> {
  return await show_react_modal((cb) => {
    const style = {
      width: "1.3em",
      paddingLeft: ".3em",
      display: "inline-block",
      cursor: "pointer",
    };
    const symbols: JSX.Element[] = SYMBOLS.map((symbol) => (
      <span
        key={symbol.code}
        style={style}
        title={symbol.code}
        onClick={() => cb(undefined, symbol)}
      >
        {symbol.char}
      </span>
    ));
    return (
      <Modal
        title={<h3>&Omega; Insert Special Symbol</h3>}
        visible={true}
        footer={<Button onClick={() => cb()}>Cancel</Button>}
        onCancel={() => cb()}
        centered
        width={"70vw"}
      >
        <div
          className="webapp-html-editor-symbols-dialog"
          style={{ fontSize: "13pt" }}
        >
          {symbols}
        </div>
      </Modal>
    );
  });
}

function insert_special_char(mode: string, opts: Options): string {
  if (mode == "html" || mode == "md") {
    return `&${opts.code};`;
  }

  // This fallback should work wherever utf8 works,
  // which is pretty general these days.
  return opts.char;
}

CodeMirror.defineExtension("insert_special_char", async function (): Promise<
  void
> {
  // @ts-ignore
  const cm = this;
  const mode = cm.get_edit_mode();
  let opts: Options | undefined = undefined;

  try {
    opts = await get_insert_special_char_from_user();
  } catch (err) {
    alert_message({ type: "error", message: err.toString() });
    return;
  }

  if (opts == null) {
    return; // user cancelled
  }

  const link = insert_special_char(mode, opts);
  const selections = cm.listSelections();
  selections.reverse();
  for (const sel of selections) {
    if (sel.empty()) {
      cm.replaceRange(link, sel.head);
    } else {
      cm.replaceRange(link, sel.from(), sel.to());
    }
  }
});

const SYMBOLS: Options[] = [
  { code: "Aacute", char: "Á" },
  { code: "aacute", char: "á" },
  { code: "Acirc", char: "Â" },
  { code: "acirc", char: "â" },
  { code: "acute", char: "´" },
  { code: "AElig", char: "Æ" },
  { code: "aelig", char: "æ" },
  { code: "Agrave", char: "À" },
  { code: "agrave", char: "à" },
  { code: "alefsym", char: "ℵ" },
  { code: "Alpha", char: "Α" },
  { code: "alpha", char: "α" },
  { code: "amp", char: "&" },
  { code: "and", char: "∧" },
  { code: "ang", char: "∠" },
  { code: "Aring", char: "Å" },
  { code: "aring", char: "å" },
  { code: "asymp", char: "≈" },
  { code: "Atilde", char: "Ã" },
  { code: "atilde", char: "ã" },
  { code: "Auml", char: "Ä" },
  { code: "auml", char: "ä" },
  { code: "bdquo", char: "„" },
  { code: "Beta", char: "Β" },
  { code: "beta", char: "β" },
  { code: "brvbar", char: "¦" },
  { code: "bull", char: "•" },
  { code: "cap", char: "∩" },
  { code: "Ccedil", char: "Ç" },
  { code: "ccedil", char: "ç" },
  { code: "cedil", char: "¸" },
  { code: "cent", char: "¢" },
  { code: "Chi", char: "Χ" },
  { code: "chi", char: "χ" },
  { code: "circ", char: "ˆ" },
  { code: "clubs", char: "♣" },
  { code: "cong", char: "≅" },
  { code: "copy", char: "©" },
  { code: "crarr", char: "↵" },
  { code: "cup", char: "∪" },
  { code: "curren", char: "¤" },
  { code: "dagger", char: "†" },
  { code: "Dagger", char: "‡" },
  { code: "darr", char: "↓" },
  { code: "dArr", char: "⇓" },
  { code: "deg", char: "°" },
  { code: "Delta", char: "Δ" },
  { code: "delta", char: "δ" },
  { code: "diams", char: "♦" },
  { code: "divide", char: "÷" },
  { code: "Eacute", char: "É" },
  { code: "eacute", char: "é" },
  { code: "Ecirc", char: "Ê" },
  { code: "ecirc", char: "ê" },
  { code: "Egrave", char: "È" },
  { code: "egrave", char: "è" },
  { code: "empty", char: "∅" },
  { code: "Epsilon", char: "Ε" },
  { code: "epsilon", char: "ε" },
  { code: "equiv", char: "≡" },
  { code: "Eta", char: "Η" },
  { code: "eta", char: "η" },
  { code: "ETH", char: "Ð" },
  { code: "eth", char: "ð" },
  { code: "Euml", char: "Ë" },
  { code: "euml", char: "ë" },
  { code: "euro", char: "€" },
  { code: "exist", char: "∃" },
  { code: "fnof", char: "ƒ" },
  { code: "forall", char: "∀" },
  { code: "frac12", char: "½" },
  { code: "frac14", char: "¼" },
  { code: "frac34", char: "¾" },
  { code: "frasl", char: "⁄" },
  { code: "Gamma", char: "Γ" },
  { code: "gamma", char: "γ" },
  { code: "ge", char: "≥" },
  { code: "gt", char: "<" },
  { code: "harr", char: "↔" },
  { code: "hArr", char: "⇔" },
  { code: "hearts", char: "♥" },
  { code: "hellip", char: "…" },
  { code: "Iacute", char: "Í" },
  { code: "iacute", char: "í" },
  { code: "Icirc", char: "Î" },
  { code: "icirc", char: "î" },
  { code: "iexcl", char: "¡" },
  { code: "Igrave", char: "Ì" },
  { code: "igrave", char: "ì" },
  { code: "image", char: "ℑ" },
  { code: "infin", char: "∞" },
  { code: "int", char: "∫" },
  { code: "Iota", char: "Ι" },
  { code: "iota", char: "ι" },
  { code: "iquest", char: "¿" },
  { code: "isin", char: "∈" },
  { code: "Iuml", char: "Ï" },
  { code: "iuml", char: "ï" },
  { code: "Kappa", char: "Κ" },
  { code: "kappa", char: "κ" },
  { code: "Lambda", char: "Λ" },
  { code: "lambda", char: "λ" },
  { code: "lang", char: "〈" },
  { code: "laquo", char: "«" },
  { code: "larr", char: "←" },
  { code: "lArr", char: "⇐" },
  { code: "lceil", char: "⌈" },
  { code: "ldquo", char: "“" },
  { code: "le", char: "≤" },
  { code: "lfloor", char: "⌊" },
  { code: "lowast", char: "∗" },
  { code: "loz", char: "◊" },
  { code: "lsaquo", char: "‹" },
  { code: "lsquo", char: "‘" },
  { code: "lt", char: "<" },
  { code: "macr", char: "¯" },
  { code: "mdash", char: "—" },
  { code: "micro", char: "µ" },
  { code: "middot", char: "·" },
  { code: "minus", char: "−" },
  { code: "Mu", char: "Μ" },
  { code: "mu", char: "μ" },
  { code: "nabla", char: "∇" },
  { code: "ndash", char: "–" },
  { code: "ne", char: "≠" },
  { code: "ni", char: "∋" },
  { code: "not", char: "¬" },
  { code: "notin", char: "∉" },
  { code: "nsub", char: "⊄" },
  { code: "Ntilde", char: "Ñ" },
  { code: "ntilde", char: "ñ" },
  { code: "Nu", char: "Ν" },
  { code: "nu", char: "ν" },
  { code: "Oacute", char: "Ó" },
  { code: "oacute", char: "ó" },
  { code: "Ocirc", char: "Ô" },
  { code: "ocirc", char: "ô" },
  { code: "OElig", char: "Œ" },
  { code: "oelig", char: "œ" },
  { code: "Ograve", char: "Ò" },
  { code: "ograve", char: "ò" },
  { code: "oline", char: "‾" },
  { code: "Omega", char: "Ω" },
  { code: "omega", char: "ω" },
  { code: "Omicron", char: "Ο" },
  { code: "omicron", char: "ο" },
  { code: "oplus", char: "⊕" },
  { code: "or", char: "∨" },
  { code: "ordf", char: "ª" },
  { code: "ordm", char: "º" },
  { code: "Oslash", char: "Ø" },
  { code: "oslash", char: "ø" },
  { code: "Otilde", char: "Õ" },
  { code: "otilde", char: "õ" },
  { code: "otimes", char: "⊗" },
  { code: "Ouml", char: "Ö" },
  { code: "ouml", char: "ö" },
  { code: "para", char: "¶" },
  { code: "part", char: "∂" },
  { code: "permil", char: "‰" },
  { code: "perp", char: "⊥" },
  { code: "Phi", char: "Φ" },
  { code: "phi", char: "φ" },
  { code: "Pi", char: "Π" },
  { code: "pi", char: "π" },
  { code: "piv", char: "ϖ" },
  { code: "plusmn", char: "±" },
  { code: "pound", char: "£" },
  { code: "prime", char: "′" },
  { code: "Prime", char: "″" },
  { code: "prod", char: "∏" },
  { code: "prop", char: "∝" },
  { code: "Psi", char: "Ψ" },
  { code: "psi", char: "ψ" },
  { code: "quot", char: '"' },
  { code: "radic", char: "√" },
  { code: "rang", char: "〉" },
  { code: "raquo", char: "»" },
  { code: "rarr", char: "→" },
  { code: "rArr", char: "⇒" },
  { code: "rceil", char: "⌉" },
  { code: "rdquo", char: "”" },
  { code: "real", char: "ℜ" },
  { code: "reg", char: "®" },
  { code: "rfloor", char: "⌋" },
  { code: "Rho", char: "Ρ" },
  { code: "rho", char: "ρ" },
  { code: "rsaquo", char: "›" },
  { code: "rsquo", char: "’" },
  { code: "sbquo", char: "‚" },
  { code: "Scaron", char: "Š" },
  { code: "scaron", char: "š" },
  { code: "sdot", char: "⋅" },
  { code: "sect", char: "§" },
  { code: "Sigma", char: "Σ" },
  { code: "sigma", char: "σ" },
  { code: "sigmaf", char: "ς" },
  { code: "sim", char: "∼" },
  { code: "spades", char: "♠" },
  { code: "sub", char: "⊂" },
  { code: "sube", char: "⊆" },
  { code: "sum", char: "∑" },
  { code: "sup", char: "⊃" },
  { code: "sup1", char: "¹" },
  { code: "sup2", char: "²" },
  { code: "sup3", char: "³" },
  { code: "supe", char: "⊇" },
  { code: "szlig", char: "ß" },
  { code: "Tau", char: "Τ" },
  { code: "tau", char: "τ" },
  { code: "there4", char: "∴" },
  { code: "Theta", char: "Θ" },
  { code: "theta", char: "θ" },
  { code: "thetasym", char: "ϑ" },
  { code: "THORN", char: "Þ" },
  { code: "thorn", char: "þ" },
  { code: "tilde", char: "˜" },
  { code: "times", char: "×" },
  { code: "trade", char: "™" },
  { code: "Uacute", char: "Ú" },
  { code: "uacute", char: "ú" },
  { code: "uarr", char: "↑" },
  { code: "uArr", char: "⇑" },
  { code: "Ucirc", char: "Û" },
  { code: "ucirc", char: "û" },
  { code: "Ugrave", char: "Ù" },
  { code: "ugrave", char: "ù" },
  { code: "uml", char: "¨" },
  { code: "upsih", char: "ϒ" },
  { code: "Upsilon", char: "Υ" },
  { code: "upsilon", char: "υ" },
  { code: "Uuml", char: "Ü" },
  { code: "uuml", char: "ü" },
  { code: "weierp", char: "℘" },
  { code: "Xi", char: "Ξ" },
  { code: "xi", char: "ξ" },
  { code: "Yacute", char: "Ý" },
  { code: "yacute", char: "ý" },
  { code: "yen", char: "¥" },
  { code: "yuml", char: "ÿ" },
  { code: "Yuml", char: "Ÿ" },
  { code: "Zeta", char: "Ζ" },
  { code: "zeta", char: "ζ" },
  { code: "zwj", char: "‍" },
  { code: "zwnj", char: "‌" },
] as Options[];
