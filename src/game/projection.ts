import type { Question as BankQuestion } from '../exam'
import { t } from '../i18n'
import { choiceIsCorrect, choiceNodesOf, stemNodesOf, type ProseMirrorJSON } from '../question-doc'
import { SECTION_LABELS } from '../exam'
import { isPlain, plainOf, type RichNode, type RichText } from './rich-text'
import type { Question } from './types'

/**
 * What a bank's questions become on the projector.
 *
 * The game plays Multiple Choice with one right answer and two to four
 * answers; every other question is left out, and the teacher is told which one
 * and why (the same rule Class Gauntlet's own importer applies to a bank file,
 * see `docs/adr/` there). The words travel as Rich Text, so formatting, maths
 * and Pictures reach the stage; a Picture is named by the Media Asset its
 * Picture source already holds, which is what the projector shows.
 */

/** A Picture's source in an authored document: the Media Asset it was kept as. */
const PICTURE_SOURCE = /^\/local-images\/([a-f0-9]{64})$/
const ASSET_PREFIX = 'sha256:'

export type SkippedQuestion = { number: number; reason: string }
export type PlayableWords = {
  stem: ProseMirrorJSON[]
  choices: ProseMirrorJSON[][]
  /** Why the right answer is right, when the question carries one. */
  explanation?: ProseMirrorJSON[]
}
export type PlayableQuestions = {
  questions: Question[]
  skipped: SkippedQuestion[]
  /** The words as the bank authored them, by question id, for the projector:
   *  it draws a question with the app's own read-only renderer, so pictures,
   *  crops and maths come out exactly as the exam page draws them. */
  words: Map<string, PlayableWords>
}

const attributesOf = (node: ProseMirrorJSON): Record<string, unknown> =>
  (node.attrs ?? {}) as Record<string, unknown>
const childrenOf = (node: ProseMirrorJSON): ProseMirrorJSON[] =>
  Array.isArray(node.content) ? (node.content as ProseMirrorJSON[]) : []
const textValue = (value: unknown): string => (typeof value === 'string' ? value : '')

/** The mark names a record writes for the marks the editor's schema holds. */
const MARK_NAMES: Record<string, string> = {
  strong: 'strong',
  emphasis: 'emphasis',
  inlineCode: 'inline-code',
  strike_through: 'strike',
  subscript: 'subscript',
  superscript: 'superscript',
}

function marksOf(node: ProseMirrorJSON): RichNode['marks'] {
  if (!Array.isArray(node.marks) || node.marks.length === 0) return undefined
  const marks = (node.marks as ProseMirrorJSON[]).flatMap((mark) => {
    const attrs = attributesOf(mark)
    if (mark.type === 'link') {
      const href = textValue(attrs.href)
      // Only a link a browser may follow: a `javascript:` one is dropped as words.
      if (!/^https?:\/\//i.test(href)) return []
      const title = textValue(attrs.title)
      return [{ type: 'link', href, ...(title ? { title } : {}) }]
    }
    const name = MARK_NAMES[String(mark.type)]
    return name ? [{ type: name }] : []
  })
  return marks.length ? marks : undefined
}

/** One authored node as the stage reads it, or null when it can't be shown. */
function gameNode(node: ProseMirrorJSON): RichNode | null {
  const attrs = attributesOf(node)
  const content = (): RichText => gameNodes(childrenOf(node))
  switch (node.type) {
    case 'text': {
      const marks = marksOf(node)
      return { type: 'text', text: textValue(node.text), ...(marks ? { marks } : {}) }
    }
    case 'hardbreak':
      return { type: 'hard-break' }
    case 'paragraph':
      return { type: 'paragraph', content: content() }
    case 'heading':
      return { type: 'heading', level: Math.min(6, Math.max(1, Number(attrs.level) || 1)), content: content() }
    case 'blockquote':
      return { type: 'blockquote', content: content() }
    case 'bullet_list':
      return { type: 'bullet-list', content: content() }
    case 'ordered_list':
      return { type: 'ordered-list', start: Number(attrs.order) || 1, content: content() }
    case 'list_item':
      return { type: 'list-item', content: content() }
    case 'code_block': {
      const source = childrenOf(node)
        .map((child) => textValue(child.text))
        .join('')
      if (textValue(attrs.language).toLowerCase() === 'latex') return { type: 'display-math', source }
      const language = textValue(attrs.language)
      return { type: 'code-block', ...(language ? { language } : {}), text: source }
    }
    case 'hr':
      return { type: 'rule' }
    case 'table':
      return { type: 'table', content: content() }
    case 'table_header_row':
      return { type: 'table-row', header: true, content: content() }
    case 'table_row':
      return { type: 'table-row', content: content() }
    case 'table_header':
      return { type: 'table-cell', header: true, content: content() }
    case 'table_cell':
      return { type: 'table-cell', content: content() }
    case 'math_inline':
      return { type: 'inline-math', source: textValue(attrs.value) }
    case 'image':
    case 'image-block': {
      const source = PICTURE_SOURCE.exec(textValue(attrs.src))
      // A Pending Image has no bytes yet, so the stage has nothing to show.
      if (!source) return null
      const alt = textValue(attrs.alt)
      const caption = textValue(attrs.caption)
      const block = node.type === 'image-block'
      return {
        type: block ? 'block-image' : 'inline-image',
        asset: ASSET_PREFIX + source[1],
        ...(alt ? { alt } : {}),
        ...(caption ? { caption } : {}),
        ...(block && attrs.align === 'center' ? { align: 'center' } : {}),
      }
    }
    // Side-by-Sides and Blank answers are lettered layouts the stage has no room for.
    default:
      return null
  }
}

/** Nodes the stage has no room for: lettered layouts and the answer machinery. */
const UNSHOWABLE = new Set([
  'sideBySide',
  'sideBySidePanel',
  'blank',
  // The answer machinery around a choice is never drawn, only the choice's own words.
  'matching',
  'matchingPrompt',
  'matchingAnswer',
  'multipartParts',
  'multipartPart',
  'multipartPartStem',
])

/** A document's nodes as the stage reads them; a node it can't show is left out. */
function gameNodes(nodes: readonly ProseMirrorJSON[]): RichText {
  const rich: RichText = []
  for (const node of nodes) {
    const shown = gameNode(node)
    if (shown) rich.push(shown)
  }
  return rich
}

/** Whether a document holds a node the stage cannot show at all. */
function hasUnshowable(nodes: readonly ProseMirrorJSON[]): boolean {
  return nodes.some((node) => UNSHOWABLE.has(String(node.type)) || hasUnshowable(childrenOf(node)))
}

/** Why a question can't be played, or null when it can. */
function problemOf(question: BankQuestion): string | null {
  if (question.type !== 'multiple-choice')
    return t('game.skip.type', { type: SECTION_LABELS[question.type] })
  const choices = choiceNodesOf(question.doc)
  if (choices.length < 2 || choices.length > 4)
    return t('game.skip.choiceCount', { count: choices.length })
  const correct = choices.filter(choiceIsCorrect).length
  if (correct === 0) return t('game.skip.noCorrect')
  if (correct > 1) return t('game.skip.manyCorrect')
  if (choices.some((node) => !plainOf(gameNodes(childrenOf(node))).trim()))
    return t('game.skip.blankChoice')
  const said = choices.map((node) => plainOf(gameNodes(childrenOf(node))).trim().toLowerCase())
  if (new Set(said).size !== said.length) return t('game.skip.sameChoices')
  const stem = stemNodesOf(question.doc)
  if (hasUnshowable(stem) || choices.some((choice) => hasUnshowable([choice]))) return t('game.skip.layout')
  if (!plainOf(gameNodes(stem)).trim()) return t('game.skip.emptyStem')
  return null
}

/**
 * The bank's playable questions, in bank order, and the ones left out with the
 * reason a teacher can act on. Question numbers are counted from 1 as the bank
 * lists them, so a number names the same question on both sides.
 */
export function playableQuestions(questions: readonly BankQuestion[]): PlayableQuestions {
  const playable: Question[] = []
  const skipped: SkippedQuestion[] = []
  const words = new Map<string, PlayableWords>()
  const plain = (rich: RichText) => plainOf(rich).trim()
  questions.forEach((question, index) => {
    const problem = problemOf(question)
    if (problem) {
      skipped.push({ number: index + 1, reason: problem })
      return
    }
    const stemNodes = stemNodesOf(question.doc)
    const explanationNodes = question.explanation ? childrenOf(question.explanation) : []
    const stem = gameNodes(stemNodes)
    const choiceNodes = choiceNodesOf(question.doc)
    const choices = choiceNodes.map((node) => gameNodes(childrenOf(node)))
    const correct = choiceNodes.findIndex(choiceIsCorrect)
    const rich = ![stem, ...choices].every(isPlain)
    words.set(question.id, {
      stem: stemNodes,
      choices: choiceNodes.map(childrenOf),
      ...(explanationNodes.length ? { explanation: explanationNodes } : {}),
    })
    const explanationRich = explanationNodes.length ? gameNodes(explanationNodes) : []
    playable.push({
      id: question.id,
      prompt: plain(stem),
      choices: choices.map(plain),
      correct,
      ...(question.topics?.length ? { topics: [...question.topics] } : {}),
      ...(explanationNodes.length ? { explanation: plain(explanationRich) } : {}),
      // The words with their formatting, maths and pictures, when they have any.
      ...(rich || explanationNodes.length
        ? {
            rich: {
              prompt: stem,
              choices,
              ...(explanationNodes.length ? { explanation: explanationRich } : {}),
            },
          }
        : {}),
    })
  })
  return { questions: playable, skipped, words }
}
