import type { Question as BankQuestion } from '../exam/exam'
import { t } from '../i18n/index'
import { choiceIsCorrect, choiceNodesOf, stemNodesOf, type ProseMirrorJSON } from '../editor/question-doc'
import { BLANK_LINE, blankAnswerText, blankAnswersOf } from '../editor/blank'
import { acceptedAnswersOf } from './text-match'
import { SECTION_LABELS } from '../exam/exam'
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
  /** A párosítás fogalmai, a fogalmak sorrendjében. */
  prompts?: ProseMirrorJSON[][]
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

/**
 * A típusok, amiket a színpad le tud játszani. A Tesztpapagájban ennél több
 * típus van (párosítás, sorrendezés, kiegészítés, rövid válasz, részkérdések),
 * de azok nem „egy helyes válasz a válaszok közül" alakúak, tehát a játék
 * nem tudja őket tisztességesen lejátszani — ezek kimaradnak, indoklással.
 */
const PLAYABLE_TYPES = new Set<string>([
  'multiple-choice',
  'true-false',
  'multiple-answer',
  'ordering',
  'matching',
  'fill-in-the-blank',
  'open',
])

/** Az Igaz/Hamis kérdés két válasza: a dokumentumban angolul állnak. */
function trueFalseLabel(index: number): string {
  return index === 0 ? t('game.trueFalse.true') : t('game.trueFalse.false')
}

/** Egyszerre ennyi hézag fér ki egy képernyőre. */
const MAX_BLANKS = 4

/**
 * A stem, a hézagok helyén vonallal: a játék a választ soha nem mutatja, a
 * hézagot viszont látni kell. Több hézagnál sorszám áll mellette, hogy a
 * telefonon a mezők összeköthetők legyenek a helyükkel.
 */
function blankMarked(nodes: readonly ProseMirrorJSON[], count: number): ProseMirrorJSON[] {
  let seen = 0
  const walk = (node: ProseMirrorJSON): ProseMirrorJSON => {
    if (node.type === 'blank') {
      seen += 1
      return { type: 'text', text: count > 1 ? `${BLANK_LINE} (${seen})` : BLANK_LINE }
    }
    const children = childrenOf(node)
    if (!children.length) return node
    return { ...node, content: children.map(walk) }
  }
  return nodes.map(walk)
}

/** Egy párosítás kérdés darabjai: a fogalmak, a válaszok, és fogalmanként a válasz. */
function matchingParts(
  doc: ProseMirrorJSON,
): { prompts: ProseMirrorJSON[]; answers: ProseMirrorJSON[]; pairs: number[] } | null {
  const node = childrenOf(doc).find((child) => child.type === 'matching')
  if (!node) return null
  const children = childrenOf(node)
  const prompts = children.filter((child) => child.type === 'matchingPrompt')
  const answers = children.filter((child) => child.type === 'matchingAnswer')
  const attr = (node: ProseMirrorJSON, key: string) =>
    String((node.attrs as Record<string, unknown> | undefined)?.[key] ?? '')
  const ids = answers.map((answer) => attr(answer, 'id'))
  const pairs: number[] = []
  for (const prompt of prompts) {
    const wanted = attr(prompt, 'answer')
    const index = wanted ? ids.indexOf(wanted) : -1
    if (index < 0) return null
    pairs.push(index)
  }
  if (prompts.length === 0 || answers.length === 0) return null
  return { prompts, answers, pairs }
}

/**
 * Az elemek felkevert sorrendje, a kérdés azonosítójából számolva: minden
 * eszköz ugyanazt a sorrendet látja, és a tanár bankja sem változik meg.
 */
function scrambledIndices(count: number, seed: string): number[] {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  const order = Array.from({ length: count }, (_, index) => index)
  for (let index = count - 1; index > 0; index -= 1) {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507) >>> 0
    const pick = hash % (index + 1)
    const swap_ = order[index]!
    order[index] = order[pick]!
    order[pick] = swap_
  }
  // Ha véletlenül a szerzői sorrend jönne ki, megfordítjuk: a feladat az legyen,
  // hogy sorrendbe kell tenni.
  if (order.every((value, index) => value === index)) order.reverse()
  return order
}

/** Why a question can't be played, or null when it can. */
function problemOf(
  question: BankQuestion,
  classic: boolean,
  vote: boolean,
  splitPanel = false,
): string | null {
  if (!PLAYABLE_TYPES.has(question.type))
    return t('game.skip.type', { type: SECTION_LABELS[question.type] })
  // A kettéosztott tábla olvas: a gépelős típusok kimaradnak.
  if (splitPanel && (question.type === 'fill-in-the-blank' || question.type === 'open'))
    return t('game.skip.multipleMode', { type: SECTION_LABELS[question.type] })
  // A több helyes válasz csak a Klasszikus módban játszható: a Bajnok és a
  // Veszély! egyetlen választ vár, ott ez a típus félrevezetne.
  if (
    (question.type === 'multiple-answer' ||
      question.type === 'ordering' ||
      question.type === 'matching' ||
      question.type === 'fill-in-the-blank' ||
      question.type === 'open') &&
    !classic
  )
    return t('game.skip.multipleMode', { type: SECTION_LABELS[question.type] })
  if (question.type === 'fill-in-the-blank') {
    const blanks = blankAnswersOf(question.doc).map((answer) => blankAnswerText(answer).trim())
    if (blanks.length === 0) return t('game.skip.emptyBlank')
    if (blanks.length > MAX_BLANKS) return t('game.skip.choiceCount', { count: blanks.length })
    if (blanks.some((answer) => !answer)) return t('game.skip.emptyBlank')
    const stem = blankMarked(stemNodesOf(question.doc), blanks.length)
    if (hasUnshowable(stem)) return t('game.skip.layout')
    if (!plainOf(gameNodes(stem)).trim()) return t('game.skip.emptyStem')
    return null
  }
  if (question.type === 'open') {
    const suggested = question.suggestedAnswer
    if (!suggested) return t('game.skip.noAnswer')
    if (acceptedAnswersOf(plainOf(gameNodes(childrenOf(suggested)))).length === 0)
      return t('game.skip.noAnswer')
    if (hasUnshowable(stemNodesOf(question.doc))) return t('game.skip.layout')
    if (!plainOf(gameNodes(stemNodesOf(question.doc))).trim()) return t('game.skip.emptyStem')
    return null
  }
  if (question.type === 'matching') {
    const pairs = matchingParts(question.doc)
    if (!pairs) return t('game.skip.unpaired')
    if (pairs.prompts.length < 2 || pairs.prompts.length > 4)
      return t('game.skip.choiceCount', { count: pairs.prompts.length })
    if (pairs.answers.length !== pairs.prompts.length) return t('game.skip.unpaired')
    return null
  }
  const choices = choiceNodesOf(question.doc)
  if (choices.length < 2 || choices.length > 4)
    return t('game.skip.choiceCount', { count: choices.length })
  // Az igaz/hamis kérdésnek pontosan a két rögzített válasza van; ha a
  // dokumentumban másmilyen áll, az nem az a kérdés, amit a tanár írt.
  if (question.type === 'true-false' && choices.length !== 2)
    return t('game.skip.choiceCount', { count: choices.length })
  if (question.type === 'ordering' && choices.length < 2)
    return t('game.skip.choiceCount', { count: choices.length })
  // Sorrendezésnél nincs megjelölt helyes válasz: a szerzői sorrend a megoldás.
  const correct = choices.filter(choiceIsCorrect).length
  if (vote) {
    // Szavazás: csak a választható, **helyes válasz nélküli** kérdés játszható.
    if (question.type !== 'multiple-choice' && question.type !== 'true-false')
      return t('game.skip.type', { type: SECTION_LABELS[question.type] })
    if (correct > 0) return t('game.skip.hasCorrect')
  } else {
    if (question.type !== 'ordering' && correct === 0) return t('game.skip.noCorrect')
    if (question.type === 'multiple-choice' && correct > 1) return t('game.skip.manyCorrect')
  }
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
export function playableQuestions(
  questions: readonly BankQuestion[],
  options: {
    classic?: boolean;
    shuffleAnswers?: boolean;
    vote?: boolean;
    /**
     * A differenciált kvíz kettéosztott táblájának készlete: válaszkártyák
     * (egyszeres és több helyes), **sorrendezés** és **párosítás**. A
     * kiegészítés és a rövid válasz kimarad — azok gépelést kérnek, a panel
     * pedig csak olvas.
     */
    splitPanel?: boolean;
  } = {},
): PlayableQuestions {
  const classic = options.classic ?? false
  const splitPanel = options.splitPanel ?? false
  // Szavazás: a helyes válasz nélküli kérdések játéka (B5).
  const vote = options.vote ?? false
  // A kártyás kérdés válaszai felkeverve állnak, hogy a szerzői sorrend ne
  // árulja el a megoldást. A keverés a kérdés azonosítójából jön, tehát a
  // tanár színpada és minden diák eszköze ugyanazt a sorrendet látja.
  const shuffleAnswers = options.shuffleAnswers ?? false
  const playable: Question[] = []
  const skipped: SkippedQuestion[] = []
  const words = new Map<string, PlayableWords>()
  const plain = (rich: RichText) => plainOf(rich).trim()
  questions.forEach((question, index) => {
    const problem = problemOf(question, classic, vote, splitPanel)
    if (problem) {
      skipped.push({ number: index + 1, reason: problem })
      return
    }
    const stemNodes = stemNodesOf(question.doc)
    const explanationNodes = question.explanation ? childrenOf(question.explanation) : []
    if (question.type === 'fill-in-the-blank' || question.type === 'open') {
      const blanks =
        question.type === 'fill-in-the-blank'
          ? blankAnswersOf(question.doc).map((answer) => blankAnswerText(answer).trim())
          : null
      const accepted =
        question.type === 'open' && question.suggestedAnswer
          ? acceptedAnswersOf(plainOf(gameNodes(childrenOf(question.suggestedAnswer))))
          : null
      const stem = gameNodes(blankMarked(stemNodes, blanks?.length ?? 0))
      const explanationRich = explanationNodes.length ? gameNodes(explanationNodes) : []
      words.set(question.id, {
        stem: blankMarked(stemNodes, blanks?.length ?? 0),
        choices: [],
        ...(explanationNodes.length ? { explanation: explanationNodes } : {}),
      })
      playable.push({
        id: question.id,
        prompt: plain(stem),
        choices: [],
        correct: 0,
        ...(blanks ? { blanks } : {}),
        ...(accepted ? { accepted } : {}),
        ...(question.topics?.length ? { topics: [...question.topics] } : {}),
        ...(explanationNodes.length ? { explanation: plain(explanationRich) } : {}),
        ...(!isPlain(stem) || explanationNodes.length
          ? {
              rich: {
                prompt: stem,
                choices: [],
                ...(explanationNodes.length ? { explanation: explanationRich } : {}),
              },
            }
          : {}),
      })
      return
    }
    if (question.type === 'matching') {
      const parts = matchingParts(question.doc)!
      const shown = scrambledIndices(parts.answers.length, `${question.id}:answers`).map(
        (index) => parts.answers[index]!,
      )
      const stem = gameNodes(stemNodesOf(question.doc))
      const prompts = parts.prompts.map((node) => plainOf(gameNodes(childrenOf(node))).trim())
      const answers = shown.map((node) => plainOf(gameNodes(childrenOf(node))).trim())
      const matches = parts.pairs.map((authoredAnswer) =>
        shown.indexOf(parts.answers[authoredAnswer]!),
      )
      const explanationNodes = question.explanation ? childrenOf(question.explanation) : []
      const promptRich = parts.prompts.map((node) => gameNodes(childrenOf(node)))
      const answerRich = shown.map((node) => gameNodes(childrenOf(node)))
      const rich = ![stem, ...promptRich, ...answerRich].every(isPlain)
      words.set(question.id, {
        stem: stemNodesOf(question.doc),
        choices: shown.map(childrenOf),
        prompts: parts.prompts.map(childrenOf),
        ...(explanationNodes.length ? { explanation: explanationNodes } : {}),
      })
      const explanationRich = explanationNodes.length ? gameNodes(explanationNodes) : []
      playable.push({
        id: question.id,
        prompt: plain(stem),
        choices: answers,
        prompts,
        matches,
        correct: matches[0] ?? 0,
        ...(question.topics?.length ? { topics: [...question.topics] } : {}),
        ...(explanationNodes.length ? { explanation: plain(explanationRich) } : {}),
        ...(rich || explanationNodes.length
          ? {
              rich: {
                prompt: stem,
                choices: answerRich,
                prompts: promptRich,
                ...(explanationNodes.length ? { explanation: explanationRich } : {}),
              },
            }
          : {}),
      })
      return
    }
    const stem = gameNodes(stemNodes)
    const authored = choiceNodesOf(question.doc)
    const labelled =
      question.type === 'true-false'
        ? authored.map((node, index) => ({
            type: 'multipleChoiceChoice',
            attrs: node.attrs,
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: trueFalseLabel(index) }],
              },
            ],
          }))
        : authored
    // A sorrendezés elemei felkeverve állnak (a szerzői sorrend a megoldás); a
    // keverés a kérdés azonosítójából jön, tehát minden eszközön ugyanaz.
    // A sorrendezés elemei mindig keverve állnak (a szerzői sorrend a
    // megoldás); az Igaz/Hamis pár sorrendje viszont szemantikus, azt nem
    // bolygatjuk. A kártyás kérdéseket a beállítás keveri.
    const cardShuffled =
      shuffleAnswers && (question.type === 'multiple-choice' || question.type === 'multiple-answer')
    const choiceNodes =
      question.type === 'ordering' || cardShuffled
        ? scrambledIndices(labelled.length, question.type === 'ordering' ? question.id : `${question.id}:answers`)
          .map((index) => labelled[index]!)
        : labelled
    const choices = choiceNodes.map((node) => gameNodes(childrenOf(node)))
    // A helyes sorrend a felkínált elemek indexeivel: az első szerzői elem
    // hányadikként áll a felkínált sorban, és így tovább.
    const correctOrder =
      question.type === 'ordering' ? labelled.map((node) => choiceNodes.indexOf(node)) : undefined
    const correct =
      question.type === 'ordering' ? (correctOrder?.[0] ?? 0) : choiceNodes.findIndex(choiceIsCorrect)
    const correctChoices =
      question.type === 'multiple-answer'
        ? choiceNodes.flatMap((node, index) => (choiceIsCorrect(node) ? [index] : []))
        : undefined
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
      ...(correctChoices ? { correctChoices } : {}),
      ...(correctOrder ? { correctOrder } : {}),
      ...(question.topics?.length ? { topics: [...question.topics] } : {}),
      ...(question.difficulty ? { difficulty: question.difficulty } : {}),
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
