# A worked example

One complete set for `MODULE-06` of the example course `CSS-4008` that ships
with ProfessorHarness — the outline, the deck, one figure, and the render
contract that ties them together.

Read it before writing your first outline or deck. It is easier to see what
`coverage.concepts_omitted` is for, or why a figure needs an entry in the plan,
in a file that has one than in a description of one.

```bash
pres check    examples/MODULE-06/MODULE-06-slides.md
pres render   examples/MODULE-06/MODULE-06-slides.md --pdf --out /tmp/pres-example
```

**The approval in `MODULE-06-slides.outline.yaml` is part of the illustration.**
No professor approved this session; the file says `approved` so that the example
can be rendered, and `approved_by` names the example rather than a person. In
real use that field carries whoever actually said yes, and nothing writes it on
its own initiative.

The content is written to show the *shape*. The teaching in it is plausible and
unremarkable; it is not a lecture anybody has given.
