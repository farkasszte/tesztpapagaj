import { Fragment, useEffect, useRef, useState } from 'react'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import { Milkdown, useEditor } from '@milkdown/react'
import { Crepe } from '@milkdown/crepe'
import { size } from '@floating-ui/dom'
import { keymapRef } from '@milkdown/crepe/feature/toolbar'
import type { Ctx } from '@milkdown/kit/ctx'
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core'
import { clearTextInCurrentBlockCommand } from '@milkdown/kit/preset/commonmark'
import { Node as ProseNode } from '@milkdown/kit/prose/model'
import { TextSelection } from '@milkdown/kit/prose/state'
import { blockConfig } from '@milkdown/kit/plugin/block'
import { uploadConfig } from '@milkdown/kit/plugin/upload'
import { keepMatching, matchingAnswerSchema, matchingAnswerView, matchingKeymap, matchingMode, matchingPromptSchema, matchingPromptView, matchingSchema, matchingView, syncMatchingPicks } from './matching'
import { keepFixedChoices, multipleChoiceChoiceSchema, multipleChoiceChoiceView, multipleChoiceKeymap, multipleChoiceMode, multipleChoiceSchema, multipleChoiceView, uniqueChoiceIds } from './multiple-choice'
import { isScriptActive, scriptKeymap, subscriptIcon, subscriptSchema, superscriptIcon, superscriptSchema, toggleScript } from './script-marks'
import { leftArrowInputRule, rightArrowInputRule } from './text-arrows'
import { centreIcon, centringDecorations, centringKeymap, configureCentring, isCentreActive, toggleCentre } from './centring-editor'
import { insertSideBySide, keepSideBySidesInStems, sideBySidePanelSchema, sideBySideIcon, sideBySidePanelView, sideBySideSchema, sideBySideView } from './side-by-side'
import type { ReactNode } from 'react'
import { cleanDocument, suggestedAnswerDocumentOf, explanationDocumentOf, withExplanation, withSuggestedAnswer, withoutExplanation, withoutSuggestedAnswer } from './question-doc'
import type { ProseMirrorJSON } from './question-doc'
import { DIFFICULTIES, DIFFICULTY_LABELS, SECTION_LABELS, topicsOf, withTopicAdded } from './exam'
import type { Difficulty, Question } from './exam'
import { DifficultyBadge, TopicBadge } from './badges'
import { pointsLabel, pointsOfQuestion, pointsOnQuestion, parsePointsInput } from './points'
import { ownDocumentMedia, saveImage } from './local-images'
import { configurePastedImages, settlePendingMedia } from './pasted-images'
import { RESOLVE_IMAGE_EVENT, configurePendingImages, pendingImageBlockView, pendingInlineImageView, type ResolveImageRequest } from './pending-image-view'
import { ResolveImagesDialog } from './resolve-images-dialog'
import { configurePictures, pictureKeys, PICTURE_MENU_EVENT, type PictureMenuRequest } from './picture-view'
import { storedPicture } from './resolved-pictures'
import { AlignCenter, AlignLeft, Captions, Check, Crop, FileType2, Gauge, Library, Plus, Tags, Trash2 } from 'lucide-react'
import { ContextMenu } from './context-menu'
import { keepMultipartParts, multipartMode, multipartPartSchema, multipartPartStemSchema, multipartPartStemView, multipartPartView, multipartPartsSchema, multipartPartsView, multipartSubpartSchema, multipartSubpartView, multipartSubpartsSchema, multipartSubpartsView } from './multipart'
import { blankIcon, blankSchema, isInBlank, toggleBlank } from './blank-editor'
import { keepSuggestedAnswer, suggestedAnswerMode, suggestedAnswerSchema, suggestedAnswerView } from './suggested-answer'
import { explanationMode, explanationSchema, explanationView, keepExplanation } from './explanation'
import { t, useT } from './i18n'
import { QUESTION_TYPE_ICONS } from './question-type-icons'

/**
 * One line of a question's front matter: an icon and a label on the left, and
 * what has been chosen on the right — or nothing at all, because Difficulty
 * and Topics are both optional and a blank field is the normal state rather
 * than an omission to be nagged about.
 *
 * Choosing opens a list under the field with a box to type in. Typing filters
 * what is on offer and moves the highlight to the best match, so a Topic is
 * reached by typing enough of it and pressing Enter. Filtering never rewrites a
 * value: casing and spelling are the teacher's.
 *
 * A single-select field replaces what is there and closes, and choosing what is
 * already chosen clears it — which is the whole of what a Clear button was for.
 * A multi-select one toggles and stays open, because choosing several is one
 * thought rather than several visits.
 *
 * `onCreate` is what makes the Topic field different from the Difficulty one:
 * Difficulty is a closed set of three, while a Topic that does not exist yet
 * is made by typing it. Writing one is the last row of the list rather than
 * something Enter does behind the highlight's back, so typing "mol" and
 * pressing Enter reaches the "Mole Ratio" that is already there.
 */
function FrontMatterSelect({
  icon,
  label,
  options,
  selected,
  multiple,
  onChange,
  onCreate,
  renderValue,
}: {
  icon: ReactNode
  label: string
  /** What can be chosen, in the order it should be offered. */
  options: readonly { value: string; label: string }[]
  selected: readonly string[]
  multiple: boolean
  onChange: (values: string[]) => void
  /** Given the trimmed text typed, when it names nothing already on offer. */
  onCreate?: (value: string) => void
  /** How one chosen value is drawn, on the field and in the list. */
  renderValue: (value: string) => ReactNode
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Which row Enter would take. Reset to the top whenever the list changes
  // underneath it, so the highlight is always on a row that is still there.
  const [active, setActive] = useState(0)
  const field = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)

  // Closing takes the focus back to the field, because the box that had it is
  // about to be unmounted: left where it fell, focus lands on the document
  // body and the dialog behind stops hearing Escape at all.
  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!field.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const trimmed = query.trim()
  const needle = trimmed.toLowerCase()
  const matching = options.filter((option) =>
    option.label.toLowerCase().includes(needle),
  )
  // Offered when what has been typed is not already a value, compared exactly.
  // Filtering is case-insensitive because that is what searching means, but two
  // spellings of one subject are two Topics: only the teacher knows whether
  // they mean the same thing, so a near-miss is offered as a new one.
  const creatable =
    onCreate !== undefined
    && trimmed.length > 0
    && !options.some((option) => option.label === trimmed)

  // Every row Enter or an arrow key can land on, in the order they are drawn.
  // Writing a new Topic is the last of them rather than a separate gesture.
  const rows: (
    | { kind: 'choose'; value: string }
    | { kind: 'create' }
  )[] = [
    ...matching.map((option) => ({ kind: 'choose' as const, value: option.value })),
    ...(creatable ? [{ kind: 'create' as const }] : []),
  ]
  const activeRow = Math.min(active, Math.max(rows.length - 1, 0))

  const choose = (value: string) => {
    if (!multiple) {
      // Choosing what is already chosen clears the field: one value, and the
      // way to have none of it is to take back the one you picked.
      onChange(selected.includes(value) ? [] : [value])
      close()
    } else {
      onChange(
        selected.includes(value)
          ? selected.filter((item) => item !== value)
          : [...selected, value],
      )
      // The row that was clicked is about to be re-rendered under a cleared
      // query; keeping the typing where the typing happens is what lets a
      // teacher name three Topics without reaching for the mouse in between.
      search.current?.focus()
    }
    setQuery('')
  }

  const create = () => {
    if (!creatable) return
    onCreate?.(trimmed)
    setQuery('')
    if (multiple) search.current?.focus()
    else close()
  }

  const commit = (row: (typeof rows)[number] | undefined) => {
    if (!row) return
    if (row.kind === 'create') create()
    else choose(row.value)
  }

  return (
    <div
      className="front-matter-field"
      ref={field}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        // The dialog behind listens for the same key to close itself.
        event.stopPropagation()
        close()
      }}
    >
      <span className="front-matter-label">
        {icon}
        {label}
      </span>
      <button
        type="button"
        className="front-matter-value"
        ref={trigger}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((current) => !current)}
      >
        {selected.length === 0 ? (
          <span className="front-matter-blank">{t('editor.empty')}</span>
        ) : (
          selected.map((value) => (
            <Fragment key={value}>{renderValue(value)}</Fragment>
          ))
        )}
      </button>
      {open && (
        <div className="front-matter-list" role="group" aria-label={label}>
          <input
            className="front-matter-search"
            ref={search}
            autoFocus
            aria-label={`Filter ${label}`}
            placeholder={onCreate ? `Search or add a ${label.replace(/s$/, '')}` : 'Search'}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                if (rows.length === 0) return
                const step = event.key === 'ArrowDown' ? 1 : -1
                setActive((current) => {
                  const from = Math.min(current, rows.length - 1)
                  return (from + step + rows.length) % rows.length
                })
                return
              }
              if (event.key !== 'Enter') return
              event.preventDefault()
              commit(rows[activeRow])
            }}
          />
          <div className="front-matter-options">
            {rows.map((row, index) =>
              row.kind === 'choose' ? (
                <button
                  type="button"
                  className="front-matter-option"
                  key={row.value}
                  data-active={index === activeRow ? 'true' : undefined}
                  data-chosen={selected.includes(row.value) ? 'true' : undefined}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(row.value)}
                >
                  {renderValue(row.value)}
                  {selected.includes(row.value) && <Check />}
                </button>
              ) : (
                <button
                  type="button"
                  className="front-matter-option"
                  key="create"
                  data-active={index === activeRow ? 'true' : undefined}
                  onMouseEnter={() => setActive(index)}
                  onClick={create}
                >
                  <Plus />
                  Add {renderValue(trimmed)}
                </button>
              ),
            )}
            {rows.length === 0 && (
              <p className="front-matter-empty">{t('editor.nothingToChoose')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CrepeQuestion({
  value,
  onChange,
  onReady,
  suggestedAnswer = false,
  fixedChoices = false,
  /** A Multiple Answer question: several of its answers may be correct. */
  severalCorrect = false,
  /** An Ordering question: its items' order is the answer. */
  orderingItems = false,
  matching = false,
  multipart = false,
  blanks = false,
}: {
  value: ProseMirrorJSON
  onChange: (doc: ProseMirrorJSON) => void
  onReady: (readDocument: () => ProseMirrorJSON) => void
  suggestedAnswer?: boolean
  /** Whether the answer list is a True/False question's fixed pair, which the
   *  teacher chooses between rather than writes. */
  fixedChoices?: boolean
  severalCorrect?: boolean
  orderingItems?: boolean
  /** Whether the question is a matching set, whose prompts and Word Bank are
   *  kept on the page the way a Suggested Answer block is. */
  matching?: boolean
  /** Whether the question is a Multipart question, whose Parts box is kept on the page
   *  the way a matching set is. */
  multipart?: boolean
  /** Whether the question is Fill in the Blank, whose toolbar and slash menu
   *  make Blanks (see `blank-editor.ts`). */
  blanks?: boolean
}) {
  /** A `mounted` hívásainak sorszáma: a Milkdown StrictMode alatt (és újramountkor)
   *  kétszer is felépül, és csak az **utolsó** példány marad élő. Ha az első is
   *  készen jelentené magát, a tanár egy hamarosan eldobott szerkesztőbe gépelne,
   *  és a szöveg elveszne. */
  const readyToken = useRef(0)
  useEditor((root) => {
    const safeValue = cleanDocument(value)
    const crepe = new Crepe({
      root,
      defaultValue: '',
      features: {
        [Crepe.Feature.CodeMirror]: true,
        [Crepe.Feature.Latex]: true,
      },
      featureConfigs: {
        // A Crepe angolul szállított feliratai: csoportok és menüpontok.
        // Csak a `label`-t írjuk felül, az ikonokat a Crepe alapértéke adja.
        [Crepe.Feature.BlockEdit]: {
          textGroup: {
            label: t('editor.groupText'),
            text: { label: t('editor.paragraph') },
            h1: { label: t('editor.heading', { level: 1 }) },
            h2: { label: t('editor.heading', { level: 2 }) },
            h3: { label: t('editor.heading', { level: 3 }) },
            h4: { label: t('editor.heading', { level: 4 }) },
            h5: { label: t('editor.heading', { level: 5 }) },
            h6: { label: t('editor.heading', { level: 6 }) },
            quote: { label: t('editor.quote') },
            divider: { label: t('editor.divider') },
          },
          listGroup: {
            label: t('editor.groupList'),
            bulletList: { label: t('editor.bulletList') },
            orderedList: { label: t('editor.orderedList') },
            taskList: { label: t('editor.taskList') },
          },
          advancedGroup: {
            label: t('editor.groupAdvanced'),
            codeBlock: null,
            image: { label: t('editor.imageItem') },
            table: { label: t('editor.tableItem') },
            math: { label: t('editor.mathItem') },
          },
          // A Side-by-Side lays two or three Panels across the stem; it goes
          // where the cursor is, and only in a stem (see `side-by-side.ts`).
          buildMenu: (builder) => {
            builder.getGroup('advanced').addItem('side-by-side', {
              label: t('editor.sideBySide'),
              icon: sideBySideIcon,
              onRun: (ctx: Ctx) => {
                ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key)
                insertSideBySide(ctx.get(editorViewCtx))
              },
            })
            // An empty Blank, with the caret in it to type its answer.
            if (blanks) {
              builder.getGroup('advanced').addItem('blank', {
                label: t('editor.blank'),
                icon: blankIcon,
                onRun: (ctx: Ctx) => {
                  ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key)
                  const view = ctx.get(editorViewCtx)
                  toggleBlank(view.state, view.dispatch)
                  view.focus()
                },
              })
            }
          },
          // Crepe only flips the slash menu above or below the caret; it never
          // shrinks it. In a short editor neither side has the menu's full
          // 420px, so the rest of it hung past the editor's edge, under the
          // dialog's actions, where its later groups could not be reached.
          // The item list takes what room there is and scrolls within it.
          slashMenu: {
            middleware: [
              size({
                padding: 8,
                apply({ availableHeight, elements }) {
                  const tabs = elements.floating.querySelector<HTMLElement>('.tab-group')
                  const groups = elements.floating.querySelector<HTMLElement>('.menu-groups')
                  if (!groups) return
                  const room = availableHeight - (tabs?.offsetHeight ?? 0)
                  // Nincs alsó padló: ha a kurzor alatt kevés a hely, a lista
                  // kevesebbet mutat és görget — a menü viszont nem lóg a
                  // párbeszéd lábléce alá, ahol a gombokat eltakarná.
                  groups.style.maxHeight = `${Math.max(0, Math.min(420, room))}px`
                },
              }),
            ],
          },
        },
        // The browser's own caret is the caret (see `caret-color` in
        // styles.css). Crepe's painted stand-in would be a second one: it
        // stays where the selection last was after the editor loses focus,
        // stops blinking there, and reads as a stray mark left in the text.
        [Crepe.Feature.Cursor]: { virtual: false },
        [Crepe.Feature.ImageBlock]: { onUpload: saveImage },
        [Crepe.Feature.Placeholder]: {
          text: multipart
            ? t('editor.hintShared')
            : blanks
              ? t('editor.hintBlank')
              : t('editor.hintQuestion'),
        },
        [Crepe.Feature.Toolbar]: {
          // A beépített gombok Tooltipjei (a gyorsbillentyűt a Crepe teszi mögé).
          boldLabel: t('editor.bold'),
          italicLabel: t('editor.italic'),
          strikethroughLabel: t('editor.strikethrough'),
          codeLabel: t('editor.code'),
          linkLabel: t('editor.link'),
          latexLabel: t('editor.formula'),
          buildToolbar: (builder) => {
            builder
              .getGroup('formatting')
              .addItem('subscript', {
                icon: subscriptIcon,
                label: t('editor.subscript'),
                keymap: keymapRef<'ToggleSubscript' | 'ToggleSuperscript'>(
                  scriptKeymap.key,
                  'ToggleSubscript',
                ),
                active: (ctx: Ctx) => isScriptActive(ctx, 'subscript'),
                onRun: (ctx: Ctx) => toggleScript(ctx, 'subscript'),
              })
              .addItem('superscript', {
                icon: superscriptIcon,
                label: t('editor.superscript'),
                keymap: keymapRef<'ToggleSubscript' | 'ToggleSuperscript'>(
                  scriptKeymap.key,
                  'ToggleSuperscript',
                ),
                active: (ctx: Ctx) => isScriptActive(ctx, 'superscript'),
                onRun: (ctx: Ctx) => toggleScript(ctx, 'superscript'),
              })
            // Centre sets the paragraphs, pictures and tables the selection
            // touches in the middle of their column (see `centring.ts`).
            builder
              .getGroup('formatting')
              .addItem('centre', {
                icon: centreIcon,
                label: t('editor.centre'),
                keymap: keymapRef<'ToggleCentre'>(centringKeymap.key, 'ToggleCentre'),
                active: (ctx: Ctx) => isCentreActive(ctx),
                onRun: (ctx: Ctx) => toggleCentre(ctx),
              })
            // The selected words become a Blank, and its answer; inside a
            // Blank, it turns back into text.
            if (blanks) {
              builder
                .getGroup('formatting')
                .addItem('blank', {
                  icon: blankIcon,
                  label: t('editor.blank'),
                  active: (ctx: Ctx) => isInBlank(ctx.get(editorViewCtx).state),
                  onRun: (ctx: Ctx) => {
                    const view = ctx.get(editorViewCtx)
                    toggleBlank(view.state, view.dispatch)
                    view.focus()
                  },
                })
            }
          },
        },
      },
    })
    crepe.editor
      .use(multipleChoiceMode(true, fixedChoices, severalCorrect, orderingItems))
      .use(suggestedAnswerMode(suggestedAnswer))
      .use(explanationMode(true))
      .use(matchingMode(matching))
      .use(multipartMode(multipart))
      .use(subscriptSchema)
      .use(superscriptSchema)
      .use(scriptKeymap)
      .use(rightArrowInputRule)
      .use(leftArrowInputRule)
      .use(multipleChoiceSchema)
      .use(multipleChoiceChoiceSchema)
      .use(multipleChoiceView)
      .use(multipleChoiceChoiceView)
      .use(multipleChoiceKeymap)
      .use(uniqueChoiceIds)
      .use(keepFixedChoices)
      .use(suggestedAnswerSchema)
      .use(suggestedAnswerView)
      .use(keepSuggestedAnswer)
      .use(explanationSchema)
      .use(explanationView)
      .use(keepExplanation)
      .use(matchingSchema)
      .use(matchingPromptSchema)
      .use(matchingAnswerSchema)
      .use(matchingView)
      .use(matchingPromptView)
      .use(matchingAnswerView)
      .use(matchingKeymap)
      .use(syncMatchingPicks)
      .use(keepMatching)
      .use(pictureKeys)
      .use(pendingImageBlockView)
      .use(pendingInlineImageView)
      .use(multipartPartsSchema)
      .use(multipartPartSchema)
      .use(multipartPartStemSchema)
      .use(multipartSubpartsSchema)
      .use(multipartSubpartSchema)
      .use(multipartPartsView)
      .use(multipartPartView)
      .use(multipartPartStemView)
      .use(multipartSubpartsView)
      .use(multipartSubpartView)
      .use(keepMultipartParts)
      .use(sideBySideSchema)
      .use(sideBySidePanelSchema)
      .use(sideBySideView)
      .use(sideBySidePanelView)
      .use(keepSideBySidesInStems)
      .use(blankSchema)
      .use(centringDecorations)
      .use(centringKeymap)
    // Make the whole multiple-choice block — or matching set — the drag target
    // instead of a single answer row: never offer a handle for a choice, prompt
    // or Word Bank answer itself, so Crepe's handle climbs to the block.
    // Paragraphs inside a cell keep their own handle, so lines can still be
    // dragged within a cell or out of it.
    crepe.editor.config((ctx) => {
      configurePastedImages(ctx)
      configurePendingImages(ctx)
      configurePictures(ctx)
      // After the pictures', whose parsing it extends.
      configureCentring(ctx)
      ctx.update(uploadConfig.key, (prev) => ({
        ...prev,
        enableHtmlFileUploader: true,
      }))
      ctx.update(blockConfig.key, (prev) => ({
        ...prev,
        filterNodes: (pos, node) => {
          for (let depth = pos.depth; depth > 0; depth -= 1) {
            const name = pos.node(depth).type.name
            if (name === 'table' || name === 'blockquote' || name === 'math_inline') {
              return false
            }
          }
          if (
            node?.type?.name === 'multipleChoiceChoice'
            || node?.type?.name === 'matchingPrompt'
            || node?.type?.name === 'matchingAnswer'
            || node?.type?.name === 'suggestedAnswer'
            || node?.type?.name === 'multipartParts'
            || node?.type?.name === 'multipartPart'
            || node?.type?.name === 'multipartPartStem'
            || node?.type?.name === 'multipartSubparts'
            || node?.type?.name === 'multipartSubpart'
            // A Panel moves with its Side-by-Side; the blocks in it keep
            // their own handles, so they drag in and out of it.
            || node?.type?.name === 'sideBySidePanel'
          ) return false
          // A Part's answers belong to that Part, and a Part is moved with
          // its own controls, so nothing inside the box offers a handle of
          // its own but the blocks a stem or an answer is written in.
          if (node?.type?.name === 'multipleChoice') {
            for (let depth = pos.depth; depth > 0; depth -= 1) {
              if (pos.node(depth).type.name === 'multipartPart') return false
            }
          }
          // A True/False question's pair is not the teacher's to move: it has
          // one place in the question and no second place to put it.
          if (fixedChoices && node?.type?.name === 'multipleChoice') return false
          return true
        },
      }))
    })
    crepe.on((listener) => {
      listener.mounted((ctx) => {
        const view = ctx.get(editorViewCtx)
        const loadedDocument = ProseNode.fromJSON(view.state.schema, safeValue)
        const tr = view.state.tr.replaceWith(
          0,
          view.state.doc.content.size,
          loadedDocument.content,
        )
        // Start the dialog with the cursor on the first line (the question) so
        // typing goes there straight away.
        tr.setSelection(TextSelection.atStart(tr.doc))
        view.dispatch(tr)
        view.focus()
        // Csak a dokumentum átvétele **és** a fókusz után jelezzük, hogy kész:
        // az `onReady` a szerkesztő szövegét adja, a jelzés pedig azt, hogy a
        // kurzor már benne van — addig a gépelés elveszne.
        const token = (readyToken.current += 1)
        requestAnimationFrame(() => {
          if (readyToken.current !== token) return
          onReady(() => cleanDocument(view.state.doc.toJSON() as ProseMirrorJSON))
        })
      })
      listener.updated((_ctx, doc) =>
        onChange(cleanDocument(doc.toJSON() as ProseMirrorJSON)),
      )
    })
    return crepe
  }, [])
  return <Milkdown />
}

export function QuestionDialog({
  question,
  isNew,
  topicSuggestions,
  ownerName,
  onCancel,
  onSave,
  onDelete,
}: {
  question: Question
  isNew: boolean
  /** Every Topic already used in the Question Bank, offered so a teacher picks
   *  the spelling they used last time rather than inventing a near-duplicate. */
  topicSuggestions: readonly string[]
  ownerName?: string
  onCancel: () => void
  onSave: (question: Question) => Promise<void>
  onDelete?: () => void
}) {
  const t = useT()
  // A question's type is settled when it is created, so the dialog reads it
  // and never changes it: there is no switch to make, and nothing to preserve
  // across one.
  const { type } = question
  const [doc] = useState<ProseMirrorJSON>(() =>
    withExplanation(
      type === 'open'
        ? withSuggestedAnswer(question.doc, question.suggestedAnswer)
        : question.doc,
      question.explanation,
    ),
  )
  const [difficulty, setDifficulty] = useState<Difficulty | ''>(question.difficulty ?? '')
  const [topics, setTopics] = useState<readonly string[]>(topicsOf(question))
  // What the Points field holds as typed; read when the question is saved, so
  // a half-typed value is never mistaken for one (see `parsePointsInput`).
  const [pointsText, setPointsText] = useState(
    question.points !== undefined && pointsOnQuestion(question) ? String(question.points) : '',
  )
  const pointsValue = parsePointsInput(pointsText)
  // A Multipart question's Points are its Parts' and Subparts' sum, kept up to
  // date as they are typed in the editor below (ADR-0042).
  const [partsPoints, setPartsPoints] = useState(() => pointsOfQuestion(question))
  const latestDoc = useRef(doc)
  const readEditorDocument = useRef<(() => ProseMirrorJSON) | null>(null)
  /** The editor paints empty and takes its document a moment later: until
   *  then anything typed into it is replaced by the load, so the surface says
   *  when it is ready — the tests wait for it, and no caret can land in a
   *  document that is about to be overwritten. */
  const [editorReady, setEditorReady] = useState(false)
  const dialog = useRef<HTMLElement>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  /** A “picture needed” block's Resolve, waiting for a picture. */
  const [resolving, setResolving] = useState<ResolveImageRequest | null>(null)
  useEffect(() => {
    const element = dialog.current
    const onResolve = (event: Event) => setResolving((event as CustomEvent<ResolveImageRequest>).detail)
    element?.addEventListener(RESOLVE_IMAGE_EVENT, onResolve)
    return () => element?.removeEventListener(RESOLVE_IMAGE_EVENT, onResolve)
  }, [])
  /** A picture's right-click menu. */
  const [pictureMenu, setPictureMenu] = useState<PictureMenuRequest | null>(null)
  useEffect(() => {
    const element = dialog.current
    const onMenu = (event: Event) => setPictureMenu((event as CustomEvent<PictureMenuRequest>).detail)
    element?.addEventListener(PICTURE_MENU_EVENT, onMenu)
    return () => element?.removeEventListener(PICTURE_MENU_EVENT, onMenu)
  }, [])

  // Escape that lands on nothing: a click on a bare patch of the dialog, or a
  // popup closing under the focus it held, leaves focus on the document body,
  // and a key pressed there never reaches the dialog's own handler. Anything
  // inside the dialog is left to that handler, so a Crepe menu still gets to
  // consume the key first.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (dialog.current?.contains(event.target as Node)) return
      onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const saveQuestion = async () => {
    if (saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await settlePendingMedia()
      const edited = cleanDocument(
        readEditorDocument.current?.() ?? latestDoc.current,
      )
      const saved: Question = {
        ...question,
        type,
        doc: await ownDocumentMedia(
          withoutExplanation(
            type === 'open' ? withoutSuggestedAnswer(edited) : edited,
          ),
        ),
      }
      if (difficulty) saved.difficulty = difficulty
      else delete saved.difficulty
      if (topics.length > 0) saved.topics = [...topics]
      else delete saved.topics
      // Points live on the Question for every type but Multipart, whose Parts
      // carry theirs in the document. What cannot be read as Points keeps the
      // Points the question had.
      if (!pointsOnQuestion(saved)) delete saved.points
      else if (pointsValue === null) delete saved.points
      else if (pointsValue !== undefined) saved.points = pointsValue
      if (type === 'open') {
        const answer = suggestedAnswerDocumentOf(edited)
        if (answer) saved.suggestedAnswer = await ownDocumentMedia(answer)
        else delete saved.suggestedAnswer
      }
      const explanation = explanationDocumentOf(edited)
      if (explanation) saved.explanation = await ownDocumentMedia(explanation)
      else delete saved.explanation
      await onSave(saved)
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : t('editor.saveFailed'),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
      onKeyDown={(event) => {
        // Bubble phase: a Crepe menu/tooltip that consumes Escape to close
        // itself stops propagation first, so the dialog only closes when
        // nothing inside handled the key.
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
        }
      }}
      onKeyDownCapture={(event) => {
        if (
          event.key === 'Enter'
          && (event.ctrlKey || event.metaKey)
          && !event.altKey
        ) {
          event.preventDefault()
          event.stopPropagation()
          void saveQuestion()
        }
      }}
    >
      <section
        className="question-dialog"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t('editor.questionEditor')}
      >
        {resolving && <ResolveImagesDialog
          occurrences={[{
            key: 'picture',
            bankId: '',
            questionNumber: 0,
            where: t('editor.question'),
            label: t('editor.thisPicture'),
            pending: resolving.pending,
            ...(resolving.alt ? { alt: resolving.alt } : {}),
            ...(resolving.caption ? { caption: resolving.caption } : {}),
          }]}
          onClose={() => setResolving(null)}
          onResolve={async (pictures) => {
            const picture = pictures.get('picture')
            if (picture) resolving.apply(await storedPicture(picture.asset), picture.authoredSize)
            setResolving(null)
          }}
        />}
        {pictureMenu && <ContextMenu
          point={pictureMenu.point}
          ariaLabel={t('editor.picture')}
          items={[
            { kind: 'action', label: t('editor.resetCrop'), icon: <Crop />, disabled: !pictureMenu.cropped, onSelect: pictureMenu.resetCrop },
            {
              kind: 'action',
              label: pictureMenu.captioned ? t('editor.removeCaption') : t('editor.addCaption'),
              icon: <Captions />,
              onSelect: pictureMenu.toggleCaption,
            },
            {
              kind: 'action',
              label: pictureMenu.centred ? t('editor.alignLeft') : t('editor.centre'),
              icon: pictureMenu.centred ? <AlignLeft /> : <AlignCenter />,
              disabled: !pictureMenu.centrable,
              onSelect: pictureMenu.toggleCentre,
            },
          ]}
          onClose={() => setPictureMenu(null)}
        />}
        <header className="dialog-header">
          <h2>{isNew ? t('editor.addQuestion') : t('editor.editQuestion')}</h2>
        </header>
        {/* The question's front matter, indented to the document's own margin
            because it is the head of the question rather than a strip bolted
            above it. Type is stated: it was settled when the question was
            created and the answer choices below depend on it. Difficulty and
            Topics are optional and both open blank. */}
        <div className="front-matter">
          {ownerName && (
            <div className="front-matter-field">
              <span className="front-matter-label">
                <Library />
                {t('bank.title')}
              </span>
              <span className="front-matter-value front-matter-stated">{ownerName}</span>
            </div>
          )}
          <div className="front-matter-field">
            <span className="front-matter-label">
              <FileType2 />
              {t('editor.type')}
            </span>
            <span className="front-matter-value front-matter-stated">
              <span className="badge badge-type">
                {QUESTION_TYPE_ICONS[type]}
                {SECTION_LABELS[type]}
              </span>
            </span>
          </div>
          <FrontMatterSelect
            icon={<Gauge />}
            label={t('editor.difficulty')}
            options={DIFFICULTIES.map((value) => ({
              value,
              label: DIFFICULTY_LABELS[value],
            }))}
            selected={difficulty ? [difficulty] : []}
            multiple={false}
            onChange={(values) => setDifficulty((values[0] as Difficulty) ?? '')}
            renderValue={(value) => <DifficultyBadge difficulty={value as Difficulty} />}
          />
          <FrontMatterSelect
            icon={<Tags />}
            label={t('editor.topics')}
            options={Array.from(new Set([...topics, ...topicSuggestions])).map(
              (topic) => ({ value: topic, label: topic }),
            )}
            selected={topics}
            multiple
            onChange={setTopics}
            onCreate={(value) => setTopics(withTopicAdded(topics, value))}
            renderValue={(value) => <TopicBadge topic={value} />}
          />
          <div className="front-matter-field">
            <span className="front-matter-label">{t('editor.points')}</span>
            {pointsOnQuestion(question) ? (
              <span className="front-matter-points">
                <input
                  className="front-matter-value front-matter-points-input"
                  type="text"
                  inputMode="numeric"
                  aria-label={t('editor.points')}
                  aria-invalid={pointsValue === undefined ? true : undefined}
                  placeholder={t('common.empty')}
                  value={pointsText}
                  onChange={(event) => setPointsText(event.target.value)}
                  onBlur={() => {
                    // Put back what was there when the field is left holding
                    // something that is not Points.
                    if (pointsValue === undefined) {
                      setPointsText(question.points !== undefined ? String(question.points) : '')
                    }
                  }}
                />
                {question.type === 'matching' ? t('editor.forWholeSet') : null}
              </span>
            ) : (
              <span className="front-matter-value front-matter-stated">
                {partsPoints === undefined ? (
                  <span className="front-matter-blank">{t('editor.setPerPart')}</span>
                ) : (
                  t('editor.fromItsParts', { points: pointsLabel(partsPoints) })
                )}
              </span>
            )}
          </div>
        </div>
        <div className="dialog-editor" data-ready={editorReady ? 'true' : undefined}>
          <CrepeQuestion
            value={doc}
            suggestedAnswer={type === 'open'}
            fixedChoices={type === 'true-false'}
            severalCorrect={type === 'multiple-answer'}
            orderingItems={type === 'ordering'}
            matching={type === 'matching'}
            multipart={type === 'multipart'}
            blanks={type === 'fill-in-the-blank'}
            onReady={(readDocument) => {
              readEditorDocument.current = readDocument
              setEditorReady(true)
            }}
            onChange={(next) => {
              latestDoc.current = next
              if (type === 'multipart') setPartsPoints(pointsOfQuestion({ ...question, doc: next }))
            }}
          />
        </div>
        <footer className="dialog-actions">
          {!isNew && onDelete && <button type="button" className="danger-button question-delete-button" onClick={onDelete}><Trash2 />{t('editor.deleteQuestion')}</button>}
          {saveError && <p className="dialog-save-error" role="alert">{saveError}</p>}
          <button type="button" className="secondary-button" onClick={onCancel}>{t('common.cancel')}</button>
          <button
            type="button"
            className="primary-button"
            disabled={saving}
            onClick={() => void saveQuestion()}
          >
            {saving ? t('common.saving') : t('editor.saveQuestion')}
          </button>
        </footer>
      </section>
    </div>
  )
}

