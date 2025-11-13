/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";
import { Button, Modal } from "antd";

import { alert_message } from "../../alerts";
import { show_react_modal } from "../../misc";

import emojis from "markdown-it-emoji/lib/data/full.json";

export interface Options {
  char: string; // utf8 representation of the symbol
  html?: string; // html code for the symbol (without "&...;" around it)
  markdown?: string; // markdown for the symbol (without ":...:" around it)
}

export async function get_insert_special_char_from_user(): Promise<
  undefined | Options
> {
  return await show_react_modal((cb) => {
    const style = {
      width: "1.3em",
      paddingLeft: ".3em",
      display: "inline-block",
      cursor: "pointer",
    };
    const symbols: React.JSX.Element[] = SYMBOLS.map((symbol, i) => (
      <span
        key={i}
        style={style}
        onClick={() => cb(undefined, symbol)}
      >
        {symbol.char}
      </span>
    ));
    return (
      <Modal
        title={<h3>&Omega; Insert Special Symbol or Emoji</h3>}
        open
        footer={<Button onClick={() => cb()}>Cancel</Button>}
        onCancel={() => cb()}
        centered
        width={"70vw"}
      >
        <div
          className="webapp-html-editor-symbols-dialog"
          style={{ fontSize: "20pt" }}
        >
          {symbols}
        </div>
      </Modal>
    );
  });
}

function insert_special_char(mode: string, opts: Options): string {
  if (mode == "html" && opts.html) {
    return `&${opts.html};`;
  }
  if (mode == "md" && opts.markdown) {
    return `:${opts.markdown}:`;
  }
  // This fallback should work wherever utf8 works,
  // which is pretty general these days.
  return opts.char;
}

CodeMirror.defineExtension(
  "insert_special_char",
  async function (): Promise<void> {
    // @ts-ignore
    const cm = this;
    let opts: Options | undefined = undefined;

    try {
      opts = await get_insert_special_char_from_user();
    } catch (err) {
      alert_message({ type: "error", message: err.toString() });
      return;
    }

    if (opts == null) {
      return; // user canceled
    }

    const selections = cm.listSelections();
    selections.reverse();
    for (const sel of selections) {
      const link = insert_special_char(cm.get_edit_mode(sel.head), opts);
      if (sel.empty()) {
        cm.replaceRange(link, sel.head);
      } else {
        cm.replaceRange(link, sel.from(), sel.to());
      }
    }
  }
);

const SYMBOLS: Options[] = [
  { html: "Aacute", char: "Á" },
  { html: "aacute", char: "á" },
  { html: "Acirc", char: "Â" },
  { html: "acirc", char: "â" },
  { html: "acute", char: "´" },
  { html: "AElig", char: "Æ" },
  { html: "aelig", char: "æ" },
  { html: "Agrave", char: "À" },
  { html: "agrave", char: "à" },
  { html: "alefsym", char: "ℵ" },
  { html: "Alpha", char: "Α" },
  { html: "alpha", char: "α" },
  { html: "amp", char: "&" },
  { html: "and", char: "∧" },
  { html: "ang", char: "∠" },
  { html: "Aring", char: "Å" },
  { html: "aring", char: "å" },
  { html: "asymp", char: "≈" },
  { html: "Atilde", char: "Ã" },
  { html: "atilde", char: "ã" },
  { html: "Auml", char: "Ä" },
  { html: "auml", char: "ä" },
  { html: "bdquo", char: "„" },
  { html: "Beta", char: "Β" },
  { html: "beta", char: "β" },
  { html: "brvbar", char: "¦" },
  { html: "bull", char: "•" },
  { html: "cap", char: "∩" },
  { html: "Ccedil", char: "Ç" },
  { html: "ccedil", char: "ç" },
  { html: "cedil", char: "¸" },
  { html: "cent", char: "¢" },
  { html: "Chi", char: "Χ" },
  { html: "chi", char: "χ" },
  { html: "circ", char: "ˆ" },
  { html: "clubs", char: "♣" },
  { html: "cong", char: "≅" },
  { html: "copy", char: "©" },
  { html: "crarr", char: "↵" },
  { html: "cup", char: "∪" },
  { html: "curren", char: "¤" },
  { html: "dagger", char: "†" },
  { html: "Dagger", char: "‡" },
  { html: "darr", char: "↓" },
  { html: "dArr", char: "⇓" },
  { html: "deg", char: "°" },
  { html: "Delta", char: "Δ" },
  { html: "delta", char: "δ" },
  { html: "diams", char: "♦" },
  { html: "divide", char: "÷" },
  { html: "Eacute", char: "É" },
  { html: "eacute", char: "é" },
  { html: "Ecirc", char: "Ê" },
  { html: "ecirc", char: "ê" },
  { html: "Egrave", char: "È" },
  { html: "egrave", char: "è" },
  { html: "empty", char: "∅" },
  { html: "Epsilon", char: "Ε" },
  { html: "epsilon", char: "ε" },
  { html: "equiv", char: "≡" },
  { html: "Eta", char: "Η" },
  { html: "eta", char: "η" },
  { html: "ETH", char: "Ð" },
  { html: "eth", char: "ð" },
  { html: "Euml", char: "Ë" },
  { html: "euml", char: "ë" },
  { html: "euro", char: "€" },
  { html: "exist", char: "∃" },
  { html: "fnof", char: "ƒ" },
  { html: "forall", char: "∀" },
  { html: "frac12", char: "½" },
  { html: "frac14", char: "¼" },
  { html: "frac34", char: "¾" },
  { html: "frasl", char: "⁄" },
  { html: "Gamma", char: "Γ" },
  { html: "gamma", char: "γ" },
  { html: "ge", char: "≥" },
  { html: "gt", char: "<" },
  { html: "harr", char: "↔" },
  { html: "hArr", char: "⇔" },
  { html: "hearts", char: "♥" },
  { html: "hellip", char: "…" },
  { html: "Iacute", char: "Í" },
  { html: "iacute", char: "í" },
  { html: "Icirc", char: "Î" },
  { html: "icirc", char: "î" },
  { html: "iexcl", char: "¡" },
  { html: "Igrave", char: "Ì" },
  { html: "igrave", char: "ì" },
  { html: "image", char: "ℑ" },
  { html: "infin", char: "∞" },
  { html: "int", char: "∫" },
  { html: "Iota", char: "Ι" },
  { html: "iota", char: "ι" },
  { html: "iquest", char: "¿" },
  { html: "isin", char: "∈" },
  { html: "Iuml", char: "Ï" },
  { html: "iuml", char: "ï" },
  { html: "Kappa", char: "Κ" },
  { html: "kappa", char: "κ" },
  { html: "Lambda", char: "Λ" },
  { html: "lambda", char: "λ" },
  { html: "lang", char: "〈" },
  { html: "laquo", char: "«" },
  { html: "larr", char: "←" },
  { html: "lArr", char: "⇐" },
  { html: "lceil", char: "⌈" },
  { html: "ldquo", char: "“" },
  { html: "le", char: "≤" },
  { html: "lfloor", char: "⌊" },
  { html: "lowast", char: "∗" },
  { html: "loz", char: "◊" },
  { html: "lsaquo", char: "‹" },
  { html: "lsquo", char: "‘" },
  { html: "lt", char: "<" },
  { html: "macr", char: "¯" },
  { html: "mdash", char: "—" },
  { html: "micro", char: "µ" },
  { html: "middot", char: "·" },
  { html: "minus", char: "−" },
  { html: "Mu", char: "Μ" },
  { html: "mu", char: "μ" },
  { html: "nabla", char: "∇" },
  { html: "ndash", char: "–" },
  { html: "ne", char: "≠" },
  { html: "ni", char: "∋" },
  { html: "not", char: "¬" },
  { html: "notin", char: "∉" },
  { html: "nsub", char: "⊄" },
  { html: "Ntilde", char: "Ñ" },
  { html: "ntilde", char: "ñ" },
  { html: "Nu", char: "Ν" },
  { html: "nu", char: "ν" },
  { html: "Oacute", char: "Ó" },
  { html: "oacute", char: "ó" },
  { html: "Ocirc", char: "Ô" },
  { html: "ocirc", char: "ô" },
  { html: "OElig", char: "Œ" },
  { html: "oelig", char: "œ" },
  { html: "Ograve", char: "Ò" },
  { html: "ograve", char: "ò" },
  { html: "oline", char: "‾" },
  { html: "Omega", char: "Ω" },
  { html: "omega", char: "ω" },
  { html: "Omicron", char: "Ο" },
  { html: "omicron", char: "ο" },
  { html: "oplus", char: "⊕" },
  { html: "or", char: "∨" },
  { html: "ordf", char: "ª" },
  { html: "ordm", char: "º" },
  { html: "Oslash", char: "Ø" },
  { html: "oslash", char: "ø" },
  { html: "Otilde", char: "Õ" },
  { html: "otilde", char: "õ" },
  { html: "otimes", char: "⊗" },
  { html: "Ouml", char: "Ö" },
  { html: "ouml", char: "ö" },
  { html: "para", char: "¶" },
  { html: "part", char: "∂" },
  { html: "permil", char: "‰" },
  { html: "perp", char: "⊥" },
  { html: "Phi", char: "Φ" },
  { html: "phi", char: "φ" },
  { html: "Pi", char: "Π" },
  { html: "pi", char: "π" },
  { html: "piv", char: "ϖ" },
  { html: "plusmn", char: "±" },
  { html: "pound", char: "£" },
  { html: "prime", char: "′" },
  { html: "Prime", char: "″" },
  { html: "prod", char: "∏" },
  { html: "prop", char: "∝" },
  { html: "Psi", char: "Ψ" },
  { html: "psi", char: "ψ" },
  { html: "quot", char: '"' },
  { html: "radic", char: "√" },
  { html: "rang", char: "〉" },
  { html: "raquo", char: "»" },
  { html: "rarr", char: "→" },
  { html: "rArr", char: "⇒" },
  { html: "rceil", char: "⌉" },
  { html: "rdquo", char: "”" },
  { html: "real", char: "ℜ" },
  { html: "reg", char: "®" },
  { html: "rfloor", char: "⌋" },
  { html: "Rho", char: "Ρ" },
  { html: "rho", char: "ρ" },
  { html: "rsaquo", char: "›" },
  { html: "rsquo", char: "’" },
  { html: "sbquo", char: "‚" },
  { html: "Scaron", char: "Š" },
  { html: "scaron", char: "š" },
  { html: "sdot", char: "⋅" },
  { html: "sect", char: "§" },
  { html: "Sigma", char: "Σ" },
  { html: "sigma", char: "σ" },
  { html: "sigmaf", char: "ς" },
  { html: "sim", char: "∼" },
  { html: "spades", char: "♠" },
  { html: "sub", char: "⊂" },
  { html: "sube", char: "⊆" },
  { html: "sum", char: "∑" },
  { html: "sup", char: "⊃" },
  { html: "sup1", char: "¹" },
  { html: "sup2", char: "²" },
  { html: "sup3", char: "³" },
  { html: "supe", char: "⊇" },
  { html: "szlig", char: "ß" },
  { html: "Tau", char: "Τ" },
  { html: "tau", char: "τ" },
  { html: "there4", char: "∴" },
  { html: "Theta", char: "Θ" },
  { html: "theta", char: "θ" },
  { html: "thetasym", char: "ϑ" },
  { html: "THORN", char: "Þ" },
  { html: "thorn", char: "þ" },
  { html: "tilde", char: "˜" },
  { html: "times", char: "×" },
  { html: "trade", char: "™" },
  { html: "Uacute", char: "Ú" },
  { html: "uacute", char: "ú" },
  { html: "uarr", char: "↑" },
  { html: "uArr", char: "⇑" },
  { html: "Ucirc", char: "Û" },
  { html: "ucirc", char: "û" },
  { html: "Ugrave", char: "Ù" },
  { html: "ugrave", char: "ù" },
  { html: "uml", char: "¨" },
  { html: "upsih", char: "ϒ" },
  { html: "Upsilon", char: "Υ" },
  { html: "upsilon", char: "υ" },
  { html: "Uuml", char: "Ü" },
  { html: "uuml", char: "ü" },
  { html: "weierp", char: "℘" },
  { html: "Xi", char: "Ξ" },
  { html: "xi", char: "ξ" },
  { html: "Yacute", char: "Ý" },
  { html: "yacute", char: "ý" },
  { html: "yen", char: "¥" },
  { html: "yuml", char: "ÿ" },
  { html: "Yuml", char: "Ÿ" },
  { html: "Zeta", char: "Ζ" },
  { html: "zeta", char: "ζ" },
  { html: "zwj", char: "‍" },
  { html: "zwnj", char: "‌" },
] as Options[];

const seen = new Set<string>();
for (const markdown in emojis) {
  const x = emojis[markdown];
  if (seen.has(x)) continue;
  seen.add(x);
  SYMBOLS.push({ markdown, char: emojis[markdown] });
}
