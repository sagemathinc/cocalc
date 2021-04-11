This is adapted from the [](https://github.com/ianstormtaylor/slate/blob/master/site/examples/mentions.tsx)[official example﻿](https://www.slatejs.org/examples/mentions).

To use this in a slate editor, you would do something like what
is below, but with your own version of insertMention.   This isn't
an Editor plugin, since I don't know how to hook into the onChange
and onKeyDown events in a plugin.  Instead I made a React hook that
has onChange and onKeyDown functions that you call in those callbacks
in your own code [1].

```jsx
import { insertMention, useMentions } from "./slate-mentions";

// ... in your commponent ...

  const editor: ReactEditor = // ...;
  const mentions = useMentions({editor, insertMention});


// ...

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

  
[1] I found another mentions plugin for slate [here](https://github.com/udecode/slate-plugins/tree/next/packages/slate-plugins/src/elements/mention), and it takes the exact same approach, so I guess this is perhaps the best way to do this...?
