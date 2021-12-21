export const desc = `These are mostly CoCalc specific keyboard shortcuts
for editing code.   Many of these are not standard functions provided
by editor keyboarding.   Keyboard shortcuts are unfortunately not currently
customizable.
`;

export default function keyboardShortcuts(isMacOS: boolean): {
  [command: string]: string;
} {
  return {
    //'Next file tab'                : 'control+]'  # temporarily disabled since broken in many ways
    //'Previous file tab'            : 'control+['
    "Build project / run code": isMacOS
      ? "shift+enter; option+T"
      : "shift+enter; alt+T",
    "Force build project": isMacOS
      ? "shift+option+enter; shift+option+T"
      : "shift+alt+enter; shift+alt+T",
    "LaTeX and markdown forward and inverse search": isMacOS
      ? "⌘+enter"
      : "alt+enter",
    "Make text smaller": "control+<",
    "Make text larger": "control+>",
    "Toggle commenting selection": "control+/",
    "Go to line": isMacOS ? "⌘+L" : "control+L",
    Find: isMacOS ? "⌘+F" : "control+F",
    "Find next": isMacOS ? "⌘+G" : "control+G",
    Replace: isMacOS ? "⌘+H" : "control+H",
    "Fold/unfold selected code": "control+Q",
    "Fill paragraph (like in Emacs)": isMacOS ? "option+Q" : "alt+Q",
    "Shift selected text right": "tab",
    "Shift selected text left": "shift+tab",
    "Split view in Sage worksheet": "shift+control+I",
    "Autoindent selection": "control+'",
    "Format code (use Prettier, etc)": isMacOS
      ? "⌘+shift+F"
      : "control+shift+F",
    "Create multiple cursors": isMacOS ? "⌘+click" : "control+click",
    "LaTeX (etc) simple autocomplete": isMacOS
      ? "option+space"
      : "control+space",
    "Sage autocomplete": "tab",
    "Split cell in Sage worksheet": "control+;",
  };
}
