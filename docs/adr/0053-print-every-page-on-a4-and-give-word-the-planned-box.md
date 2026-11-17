---
status: accepted
---

# Print every page on A4, and give Word the box the plan packed

Two defects reached a teacher's Word file, and both came from the same place: the sheet an
Exam prints on, and the box a page's content is given, were stated in one adapter and not in
the other.

**The sheet.** Paper size was a Paper Style rule (ADR-0045): US Letter under Standard,
Classic and Condensed, A4 only under Exam Board. A Hungarian school prints on A4, so a
teacher who set a compact, small-type paper and exported it to Word got a page four
millimetres too wide and eleven too short — the page the app drew on screen, and the page
Word printed, were not the same paper. Nothing in the Format menu offered a choice, and the
style hint said "A4" only where the Exam Board style was described.

A4 is now every style's sheet. It is a decision about the product's schools rather than a
style's own look: a style sets labels, ruling, spacing and what it prints, not the paper.
A plan recorded before this decision carries its US Letter size and re-exports on that sheet
unchanged, which is what ADR-0014 asks of any recorded plan.

**The box.** A page is packed against `pageContentHeight`: the sheet's margins, less the
header band and the footer band. Print draws those bands inside the margin box and gives
the content what is left, so the screen, the PDF and the plan agree. Word does not: a header
and a footer live in the margins, and the body gets whatever is left between them. The DOCX
adapter stated the sheet's margins as the section's margins and left Word's default header
distance in place, so every Word page had the header's and the footer's room a second time —
a body box about 58pt taller than the box the page was filled in. Content stopped short of
the page's foot and the break fell early: a page of 8 questions ended halfway down, and the
next began on a fresh sheet, in a file that was supposed to hold the plan's pagination.

Each section now states the sheet's margins as its header and footer distance, and widens
its top and bottom margins by the bands the plan reserved for that page — the header
variant's height, less the room a wrapping title or a page number printed above it adds,
plus the footer's. Word's body box is then exactly the plan's content box, and the page
holds what the plan put on it. The DOCX fingerprint reads a section's sheet margins from
those distances, so structural parity still compares the sheet the teacher asked for rather
than the box Word was given to hold it.

**The spacing.** A page's heights are what `Measure` read off the sheet: an item's own markup,
`.exam-question`'s 26px bottom margin included, and print's 1em between a stem and its choice
grid. Word has no such rules, and the adapter emitted neither — a question followed the one
before it with 4pt of space and a grid cell's paragraphs carried that 4pt inside the cell. A
page that packing had filled drew at 80% and broke early, which is what a teacher reads as
"the pagination is wrong". Every question another one follows now opens with the Paper Style's
`questionGap`, a paragraph about to hold a table carries the whole paragraph gap, and a cell's
paragraphs sit tight.

Measured, before and after, on a small-type Condensed exam exported through the dialog and
rendered by Word: the sheet went from 612×792pt to 595.28×841.89pt; the header started at
the sheet's 54pt margin instead of Word's own 35.2pt; the first body line moved from 85.5pt
to 123.8pt from the page's top edge — the 54pt margin, the 63pt first-page header band, and
the line's own leading; and the body's height became the planned 644pt. Word's page count
matched the plan's, 3 to 3.

A twenty-question, small-type, two-column paper measured through the dialog: its plan packed
9 + 10 + 1 questions over three test pages, and Word drew that as 4 physical pages before the
fix (a question spilled) and as 4 sections over 4 pages after it, with the first two pages
filled to 94% and 92% instead of 81% and 78%. The rest is Word's own leading against print's,
which no adapter reproduces to the point.
