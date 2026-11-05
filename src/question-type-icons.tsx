import type { ReactNode } from 'react'
import { AlignLeft, BookOpenText, ListChecks, SquareCheckBig, ListOrdered, ToggleLeft, Link2, TextCursorInput } from 'lucide-react'
import type { QuestionType } from './exam'

export const QUESTION_TYPE_ICONS: Record<QuestionType, ReactNode> = {
  'multiple-choice': <ListChecks />,
  'multiple-answer': <SquareCheckBig />,
  ordering: <ListOrdered />,
  'true-false': <ToggleLeft />,
  matching: <Link2 />,
  'fill-in-the-blank': <TextCursorInput />,
  open: <AlignLeft />,
  multipart: <BookOpenText />,
}
