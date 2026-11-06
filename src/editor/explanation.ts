import type { Ctx, MilkdownPlugin } from '@milkdown/kit/ctx'
import { createSlice } from '@milkdown/kit/ctx'
import { $nodeSchema, $prose, $view } from '@milkdown/kit/utils'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { Plugin } from '@milkdown/kit/prose/state'
import type { NodeView } from '@milkdown/kit/prose/view'
import { t } from '../i18n/index'

/**
 * A magyarázat: amit a felfedés után a tanár (és a kvízjáték kivetítője) megmutat
 * — miért az a helyes válasz. Ugyanaz a minta, mint a rövid válasz kérdés
 * Suggested Answer blokkja: egy szerkeszthető blokk a kérdés dokumentumában,
 * amit a párbeszéd mentéskor kiemel a Question saját Explanation mezőjébe, így
 * soha nem kerül bele a stembe.
 *
 * Minden kérdéstípusnál ott van, üresen: egy magyarázat beírható, nem hozzáadható.
 */
export const explanationModeCtx = createSlice(false, 'explanationMode')

export const explanationMode = (enabled: boolean): MilkdownPlugin => (ctx) => {
  ctx.inject(explanationModeCtx, enabled)
  return () => () => {
    ctx.remove(explanationModeCtx)
  }
}

export const explanationSchema = $nodeSchema('explanation', () => ({
  group: 'block',
  content: 'paragraph block*',
  defining: true,
  parseDOM: [{ tag: 'div[data-type="explanation"]' }],
  toDOM: () => ['div', { 'data-type': 'explanation' }, 0],
  parseMarkdown: { match: () => false, runner: () => undefined },
  toMarkdown: { match: () => false, runner: () => undefined },
}))

/** Ha a tanár kivágja a blokkot, üresen visszanő: a hely mindig ott van. */
export const keepExplanation = $prose((ctx: Ctx) =>
  new Plugin({
    appendTransaction(transactions, _oldState, newState) {
      if (!ctx.get(explanationModeCtx)) return null
      if (!transactions.some((tr) => tr.docChanged)) return null
      let present = false
      newState.doc.forEach((node) => {
        if (node.type.name === 'explanation') present = true
      })
      if (present) return null
      const block = newState.schema.nodes.explanation
      const paragraph = newState.schema.nodes.paragraph
      if (!block || !paragraph) return null
      return newState.tr.insert(newState.doc.content.size, block.create(null, paragraph.create()))
    },
  }),
)

/** A blokk a szerkesztőben: címke balra, a szerkeszthető magyarázat mellette. */
export const explanationView = $view(
  explanationSchema.node,
  () => (initialNode: ProseNode): NodeView => {
    let node: ProseNode = initialNode

    const dom = document.createElement('div')
    dom.className = 'ex-block'
    dom.dataset.type = 'explanation'

    const label = document.createElement('div')
    label.className = 'ex-label'
    label.contentEditable = 'false'
    label.textContent = t('editor.explanationLabel')

    const contentDOM = document.createElement('div')
    contentDOM.className = 'ex-body'
    contentDOM.dataset.placeholder = t('editor.explanationPlaceholder')

    dom.append(label, contentDOM)

    return {
      dom,
      contentDOM,
      update(next) {
        if (next.type !== node.type) return false
        node = next
        return true
      },
      ignoreMutation: (mutation) => label.contains(mutation.target),
      stopEvent: (event) => label.contains(event.target as Node),
    }
  },
)
