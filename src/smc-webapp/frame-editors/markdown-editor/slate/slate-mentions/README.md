This is adapted from https://github.com/ianstormtaylor/slate/blob/master/site/examples/mentions.tsx

To use this in a slate editor, you would do something like what
is below, but with your own version of insertMention.   This isn't
an Editor plugin, since I don't know how to hook into the onChange
and onKeyDown events in a plugin.  Instead I made a react hook that
has onChange and onKeyDown functions that you call in those callbacks
in your own code.

```
import { insertMention, useMentions } from "./slate-mentions";


  const editor: ReactEditor = ...;
  const mentions = useMentions({editor, insertMention});


...
  return (
    <Slate
      editor={editor}
      value={value}
      onChange={value => {
        setValue(value);
        mentions.onChange();
      }}
    >
      <Editable
        onKeyDown={(event) => {
          mentions.onKeyDown(e);
          if (e.defaultPrevented) return;
        }}
      />
      {mentions.Mentions}
    </Slate>
  )
...
```
