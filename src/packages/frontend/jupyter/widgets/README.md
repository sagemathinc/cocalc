# ipywidgets in CoCalc

\(NOTE: This [`README.md`](http://README.md) sits next to some Jupyter widgets code, but there is significant code elsewhere in CoCalc. \)

## Architecture

A big part of ipywidgets is basically, at its core, an implementation of RTC \(realtime collaboration\) between two clients.   This is necessary, because there are ipywidgets for various kernels in different kernels, so one wants an RTC algorithm that is simple enough to implement for all of these kernels.

CoCalc uses that realtime sync in a very limited way:

```
This is running on a backend somewhere:

           (100% of the ipywidgets communications stuff is here)
    [Jupyter Kernel]  <-------------------------->   [Node.js Process]    
    

```

The communication between the node.js process above and any number of browser clients is accomplished entirely via CoCalc's own implementation of RTC.  As a side effect, this makes it so multiple people can use ipywidgets in collaboration.  Also, it provides a clear conceptual separation between widgets an RTC, which should be two completely separate things, but which are tangled up in ipywidgets itself.   \(Necessarily, due to multiple kernels in different languages, it might be harder to separate this in ipywidgets itself; or maybe I'm totally wrong, since it's not like I understand the internal architecture of ipywidgets super well.\)

The most important files in CoCalc, relevant to implementation of ipywidgets:

- `packages/sync/editor/generic/ipywidgets-state.ts` \- runs in the node.js process and browser clients and manages RTC between them \(see also `jupyter/browser-actions.ts` and `jupyter/project-actions.ts`, which refers to `ipywidgets_state).` 
- `packages/frontend/jupyter/widgets/manager.ts` \- keeps track of incoming widget information.
- `packages/frontend/jupyter/output-messages/widget.tsx` \- renders widgets using React \+ Lumino

## Custom Widgets

We do not \(yet?\) directly support custom widgets.  We might never do that, instead just doing our integration of those very same widgets, on a case\-by\-case basis.  We will see...
