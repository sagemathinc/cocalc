import { defineMessage } from "react-intl";

import { IntlMessage } from "@cocalc/frontend/i18n";

export default function keyboardShortcuts(
  isMacOS: boolean,
): Readonly<{ command: IntlMessage; shortcut: string }[]> {
  return [
    //'Next file tab'                : 'control+]'  # temporarily disabled since broken in many ways
    //'Previous file tab'            : 'control+['
    {
      command: defineMessage({
        id: "account.keyboard-shortcuts.shortcut.run-code",
        defaultMessage: "Build project / run code",
      }),
      shortcut: isMacOS ? "shift+enter; option+T" : "shift+enter; alt+T",
    },
    {
      command: defineMessage({
        id: "account.keyboard-shortcuts.shortcut.force-build",
        defaultMessage: "Force build project",
      }),
      shortcut: isMacOS
        ? "shift+option+enter; shift+option+T"
        : "shift+alt+enter; shift+alt+T",
    },
    {
      command: defineMessage({
        id: "account.keyboard-shortcuts.shortcut.forward-inverse-search",
        defaultMessage: "LaTeX and markdown forward and inverse search",
      }),
      shortcut: isMacOS ? "⌘+enter" : "alt+enter",
    },
    {
      command: defineMessage({
        id: "account.keyboard-shortcuts.shortcut.make-text-smaller",
        defaultMessage: "Make text smaller",
      }),
      shortcut: "control+<",
    },
    {
      command: defineMessage({
        id: "account.keyboard-shortcuts.shortcut.make-text-larger",

        defaultMessage: "Make text larger",
      }),
      shortcut: "control+>",
    },
    {
      command: defineMessage({
        id: "account.keyboard-shortcuts.shortcut.toggle-comment",
        defaultMessage: "Toggle commenting selection",
      }),
      shortcut: "control+/",
    },
    {
      command: defineMessage({
        id: "account.keyboard-shortcuts.shortcut.goto",
        defaultMessage: "Go to line",
      }),
      shortcut: isMacOS ? "⌘+L" : "control+L",
    },
    {
      command: defineMessage({
        id: "account.keyboard-shortcuts.shortcut.find",
        defaultMessage: "Find",
      }),
      shortcut: isMacOS ? "⌘+F" : "control+F",
    },
    {
      command: defineMessage({
        id: "account.keyboard-shortcuts.shortcut.find-next",
        defaultMessage: "Find next",
      }),
      shortcut: isMacOS ? "⌘+G" : "control+G",
    },
    {
      command: defineMessage({
        id: "account.keyboard-shortcuts.shortcut.replace",
        defaultMessage: "Replace",
      }),
      shortcut: isMacOS ? "⌘+H" : "control+H",
    },
    {
      command: defineMessage({
        id: "account.keyboard-shortcuts.shortcut.fold-unfold",
        defaultMessage: "Fold/unfold selected code",
      }),
      shortcut: "control+Q",
    },
    {
      command: defineMessage({
        id: "account.keyboard-shortcuts.shortcut.fill-paragraph",
        defaultMessage: "Fill paragraph (like in Emacs)",
      }),
      shortcut: isMacOS ? "option+Q" : "alt+Q",
    },
    {
      command: defineMessage({
        id: "account.keyboard-shortcuts.shortcut.shift-text-right",
        defaultMessage: "Shift selected text right",
      }),
      shortcut: "tab",
    },
    {
      command: defineMessage({
        id: "account.keyboard-shortcuts.shortcut.shift-text-left",
        defaultMessage: "Shift selected text left",
      }),
      shortcut: "shift+tab",
    },
    {
      command: defineMessage({
        id: "account.keyboard-shortcuts.shortcut.split-view-sagews",
        defaultMessage: "Split view in Sage worksheet",
      }),
      shortcut: "shift+control+I",
    },
    {
      command: defineMessage({
        id: "account.keyboard-shortcuts.shortcut.autoindent",
        defaultMessage: "Autoindent selection",
      }),
      shortcut: "control+'",
    },
    {
      command: defineMessage({
        id: "account.keyboard-shortcuts.shortcut.format-code",
        defaultMessage: "Format code (use Prettier, etc)",
      }),
      shortcut: isMacOS ? "⌘+shift+F" : "control+shift+F",
    },
    {
      command: defineMessage({
        id: "account.keyboard-shortcuts.shortcut.multiple-cursors",
        defaultMessage: "Create multiple cursors",
      }),
      shortcut: isMacOS ? "⌘+click" : "control+click",
    },
    {
      command: defineMessage({
        id: "account.keyboard-shortcuts.shortcut.latex-autocomplete",
        defaultMessage: "LaTeX (etc) simple autocomplete",
      }),
      shortcut: isMacOS ? "option+space" : "control+space",
    },
    {
      command: defineMessage({
        id: "account.keyboard-shortcuts.shortcut.sage-autocomplete",
        defaultMessage: "Sage autocomplete",
      }),
      shortcut: "tab",
    },
    {
      command: defineMessage({
        id: "account.keyboard-shortcuts.shortcut.split-cell",
        defaultMessage: "Split cell in Sage worksheet",
      }),
      shortcut: "control+;",
    },
  ] as const;
}
