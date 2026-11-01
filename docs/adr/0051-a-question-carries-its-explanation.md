---
status: accepted
---

# A Question carries its Explanation

A teacher who shows the answer also wants to say why it is the answer, and until now there was nowhere to write it: the only place for words beyond the stem and the choices was a Short Answer question's Suggested Answer, which is answer material for grading, never something the class sees.

**The Explanation is Question Content.** `Question.explanation` is an optional document, shaped like a stem, so it holds the teacher's formatting, maths and Pictures. It belongs to the question and not to one Exam, exactly as the words do, and no printed test shows it: it is shown once the answer is revealed, which today means a screen. The question editor keeps it in an Explanation block at the foot of the question document, always present and empty until typed into, the way a Short Answer question keeps its Suggested Answer block; the dialog lifts it out of the document before saving, so it never reaches the stem.

**Records carry it from 0.13.0.** A Question Bank Record writes `explanation` as a document beside `stem` and `suggestedAnswer`, and reads it back. Earlier versions have no place for one and are read as before; a record that declares 0.13.0 may leave it out, which is what a question without one looks like. Bank Files and share links carry it for free, and an importer that reads 0.12.0 still opens an older bank exactly as it did.

**The printed exam does not change.** The Explanation is not in the Layout Plan, not on the sheet, and not in the Answer Key: it is not a space on paper, and printing it would give away the answer beside the question. A DOCX or PDF a teacher hands out is therefore byte-for-byte what it was.

**The game shows it.** The Quiz Game's reveal is where the Explanation belongs: the projector shows the question, then the answer, then why. It travels with the question's words, so a resumed game still has it, and its Pictures resolve through the same Media Assets as the stem's.
