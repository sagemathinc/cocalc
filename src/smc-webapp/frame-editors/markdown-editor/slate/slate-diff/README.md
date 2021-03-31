This code efficiently computes a diff between two stats of
a slatejs editor.  This is, of course, most efficient in case
of the document model of _thi_ particular editor that we're
working with.

INPUT: Two slate.js documents doc0 and doc1, i.e., these are editor.children
for two editors. This is usually two states of the same editor at different
(nearby) points in time.

OUTPUT: A sequence of slatejs operations that convert doc0 into doc1.  These
must be applied using Transform.apply and NOT editor.apply (except the last
one).

The goal with creating the sequence of operations is:

- It doesn't impact too much of the document, i.e., the patches are fairly minimal, not "just delete all of doc0 and all of doc1".  We don't claim to produce an optimal sequence of steps.

- it avoids deleting nodes, and instead uses mutations of
  properties, text, splitting, merging etc. This is VERY important because it's
  the only way to preserve the user's cursor.

- Very efficient in terms of speed (e..g, a few ms even for a document with thousands of nodes).  We accomplish this by making hierarchical use of diff-match-patch.


