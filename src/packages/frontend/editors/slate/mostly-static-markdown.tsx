/*
Mostly static markdown, but with some minimal dynamic editable content, e.g., checkboxes,
and maybe some other nice features, but much less than a full slate editor!

This is used a lot in the frontend app, whereas the fully static one is used a lot in the next.js app.

Extras include:

- checkboxes

- support for clicking on a hashtag being detected (e.g., used by task lists).

This is a react component that renders markdown text using  Unlike the
component defined in editable-markdown.tsx, this component is *static* -- you
can't edit it. Moreover, it can be fully rendered on node.js for use in Next.js,
i.e., it doesn't depend on running in a browser.

What does this have to do with editors/slate?  There's a lot of excellent code
in here for:

- Parsing markdown that is enhanced with math, checkboxes, and any other
enhancements we use in CoCalc to a JSON format.

- Converting that parsed markdown to React components.

What Slate does is provide an interactive framework to manipulate that parsed
JSON object on which we build a WYSIWYG editor. However, the inputs above also
lead to a powerful and extensible way of rendering markdown text using React,
where we can use React components for rendering, rather than HTML. This is more
robust, secure, etc. Also, it's **possible** to use virtuoso to do windowing
and hence render very large documents, which isn't possible using straight HTML,
and we can do other things like section folding and table of contents in a natural
way with good code use!

- We also optionally support very very minimal editing of static markdown right now:
   - namely, you can click checkboxes.  That's it.
  Editing preserves as much as it can about your original source markdown.
*/

import { CSSProperties, useEffect, useRef, useMemo, useState } from "react";
import "./elements/init-ssr";
import { getStaticRender } from "./elements/register";
import { markdown_to_slate as markdownToSlate } from "./markdown-to-slate";
import { slate_to_markdown as slateToMarkdown } from "./slate-to-markdown";
import Leaf from "./leaf";
import Hashtag from "./elements/hashtag/component";
import Highlighter from "react-highlight-words";
import { ChangeContext } from "./use-change";

const HIGHLIGHT_STYLE = {
  padding: 0,
  backgroundColor: "#feff03", // to match what chrome browser users.
};

interface Props {
  value: string;
  className?: string;
  style?: CSSProperties;
  onChange?: (string) => void; // if given support some very minimal amount of editing, e.g., checkboxes; onChange is called with modified markdown.
  selectedHashtags?: Set<string>; // assumed lower case!
  toggleHashtag?: (string) => void;
  searchWords?: Set<string> | string[]; // highlight text that matches anything in here
}

export default function MostlyStaticMarkdown({
  value,
  className,
  style,
  onChange,
  selectedHashtags,
  toggleHashtag,
  searchWords,
}: Props) {
  // Convert markdown to our slate JSON object representation.
  const syncCacheRef = useRef<any>({});
  const valueRef = useRef<string>(value);
  const [editor, setEditor] = useState({
    children: markdownToSlate(value, false, syncCacheRef.current),
  });
  const handleChange = useMemo(() => {
    if (onChange == null) return; // nothing
    return (element, change) => {
      // Make a new slate value via setEditor, and also
      // report new markdown string via onChange.
      const editor1 = { children: [...editor.children] };
      if (mutateEditor(editor1.children, element, change)) {
        // actual change
        onChange(
          slateToMarkdown(editor1.children, { cache: syncCacheRef.current }),
        );
        setEditor(editor1);
      }
    };
  }, [editor, onChange]);

  const [change, setChange] = useState<number>(0);
  useEffect(() => {
    if (value == valueRef.current) return;
    valueRef.current = value;
    setEditor({
      children: markdownToSlate(value, false, syncCacheRef.current),
    });
    setChange(change + 1);
  }, [value]);

  if (searchWords != null && searchWords["filter"] == null) {
    // convert from Set<string> to string[], as required by the Highlighter component.
    searchWords = Array.from(searchWords);
  }

  return (
    <ChangeContext.Provider
      value={{
        change,
        editor: editor as any,
        setEditor: (editor) => {
          setEditor(editor);
          setChange(change + 1);
        },
      }}
    >
      <div style={{ width: "100%", ...style }} className={className}>
        {editor.children.map((element, n) => (
          <RenderElement
            key={n}
            element={element}
            handleChange={handleChange}
            selectedHashtags={selectedHashtags}
            toggleHashtag={toggleHashtag}
            searchWords={searchWords}
          />
        ))}
      </div>
    </ChangeContext.Provider>
  );
}

function RenderElement({
  element,
  handleChange,
  selectedHashtags,
  toggleHashtag,
  searchWords,
}) {
  let children: React.JSX.Element[] = [];
  if (element["children"]) {
    let n = 0;
    for (const child of element["children"]) {
      children.push(
        <RenderElement
          key={n}
          element={child}
          handleChange={handleChange}
          selectedHashtags={selectedHashtags}
          toggleHashtag={toggleHashtag}
          searchWords={searchWords}
        />,
      );
      n += 1;
    }
  }
  const type = element["type"];
  if (type) {
    if (selectedHashtags != null && type == "hashtag") {
      return (
        <Hashtag
          value={element.content}
          selected={selectedHashtags.has(element.content?.toLowerCase())}
          onClick={
            toggleHashtag != null
              ? () => {
                  toggleHashtag(element.content?.toLowerCase());
                }
              : undefined
          }
        />
      );
    }

    const C = getStaticRender(element.type);
    return (
      <C
        children={children}
        element={element}
        attributes={{} as any}
        setElement={
          handleChange == null
            ? undefined
            : (change) => handleChange(element, change)
        }
      />
    );
  }
  // It's text
  return (
    <Leaf leaf={element} text={{} as any} attributes={{} as any}>
      {searchWords != null ? (
        <HighlightText searchWords={searchWords} text={element["text"]} />
      ) : (
        element["text"]
      )}
    </Leaf>
  );
}

export function HighlightText({ text, searchWords }) {
  searchWords = Array.from(searchWords);
  if (searchWords.length == 0) {
    return <>{text}</>;
  }
  return (
    <Highlighter
      highlightStyle={HIGHLIGHT_STYLE}
      searchWords={searchWords}
      /* autoEscape: since otherwise partial matches in parts of words add weird spaces in the word itself.*/
      autoEscape={true}
      textToHighlight={text}
    />
  );
}

function mutateEditor(children: any[], element, change): boolean {
  for (const elt of children) {
    if (elt === element) {
      for (const key in change) {
        elt[key] = change[key];
      }
      return true;
    }
    if (elt.children != null) {
      // recurse
      if (mutateEditor(elt.children, element, change)) {
        return true;
      }
    }
  }
  return false;
}
