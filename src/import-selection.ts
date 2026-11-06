import type { ImportProposal } from './package-import'
import { t } from './i18n/index'

/**
 * What a teacher has chosen to bring in from one import proposal: which banks
 * and Exams are allowed, and where each allowed bank goes.
 *
 * Pure logic, so the dialog renders it and the commit applies it without
 * either re-deriving the dependency rules. Those rules keep one invariant —
 * an allowed Exam's banks are always allowed — from both directions: denying
 * a bank denies the Exams that use it, and allowing an Exam allows the banks
 * it uses.
 */

export type BankTarget =
  | { kind: 'new'; name: string }
  | { kind: 'existing'; bankId: string }

export type ImportSelection = {
  banks: Record<string, { allowed: boolean; target: BankTarget }>
  exams: Record<string, { allowed: boolean }>
}

/** Everything allowed. Each bank goes to a new bank named from its record,
 *  or — when the file was dropped on a bank — into that bank. */
export function initialSelection(
  proposal: ImportProposal,
  options: { targetBankId?: string } = {},
): ImportSelection {
  return {
    banks: Object.fromEntries(proposal.banks.map((bank) => [
      bank.id,
      {
        allowed: true,
        target: options.targetBankId
          ? { kind: 'existing', bankId: options.targetBankId }
          : { kind: 'new', name: bank.record.bank.name },
      },
    ])),
    exams: Object.fromEntries(proposal.exams.map((exam) => [exam.key, { allowed: true }])),
  }
}

export function setBankAllowed(
  proposal: ImportProposal,
  selection: ImportSelection,
  bankId: string,
  allowed: boolean,
): ImportSelection {
  const current = selection.banks[bankId]
  if (!current) return selection
  const banks = { ...selection.banks, [bankId]: { ...current, allowed } }
  if (allowed) return { ...selection, banks }
  const dependents = new Set(proposal.banks.find(({ id }) => id === bankId)?.exams ?? [])
  const exams = Object.fromEntries(Object.entries(selection.exams).map(([key, exam]) => [
    key,
    dependents.has(key) ? { allowed: false } : exam,
  ]))
  return { banks, exams }
}

export function setExamAllowed(
  proposal: ImportProposal,
  selection: ImportSelection,
  examKey: string,
  allowed: boolean,
): ImportSelection {
  if (!selection.exams[examKey]) return selection
  const exams = { ...selection.exams, [examKey]: { allowed } }
  if (!allowed) return { ...selection, exams }
  const needed = new Set(proposal.exams.find(({ key }) => key === examKey)?.banks ?? [])
  const banks = Object.fromEntries(Object.entries(selection.banks).map(([id, bank]) => [
    id,
    needed.has(id) ? { ...bank, allowed: true } : bank,
  ]))
  return { banks, exams }
}

export function setBankTarget(
  selection: ImportSelection,
  bankId: string,
  target: BankTarget,
): ImportSelection {
  const current = selection.banks[bankId]
  if (!current) return selection
  return { ...selection, banks: { ...selection.banks, [bankId]: { ...current, target } } }
}

/** The denied banks an Exam needs — why a denied Exam is denied, when it is
 *  because of its banks rather than the teacher's own choice. */
export function deniedBanksOf(
  proposal: ImportProposal,
  selection: ImportSelection,
  examKey: string,
): string[] {
  const exam = proposal.exams.find(({ key }) => key === examKey)
  return (exam?.banks ?? []).filter((id) => !selection.banks[id]?.allowed)
}

export function hasAllowedItems(selection: ImportSelection): boolean {
  return Object.values(selection.banks).some(({ allowed }) => allowed)
    || Object.values(selection.exams).some(({ allowed }) => allowed)
}

/** How many banks and Exams the selection will bring in, or how many the file
 *  holds while nothing is allowed — so the count never reads zero of both. */
export function importCounts(
  proposal: ImportProposal,
  selection: ImportSelection,
): { banks: number; exams: number } {
  if (!hasAllowedItems(selection)) {
    return { banks: proposal.banks.length, exams: proposal.exams.length }
  }
  return {
    banks: Object.values(selection.banks).filter(({ allowed }) => allowed).length,
    exams: Object.values(selection.exams).filter(({ allowed }) => allowed).length,
  }
}

/** “a”, “a and b”, “a, b, and c” — the conjunction comes from the language. */
function listed(parts: string[]): string {
  const and = t('common.andWord')
  if (parts.length <= 2) return parts.join(` ${and} `)
  return `${parts.slice(0, -1).join(', ')}, ${and} ${parts.at(-1)}`
}

/** Beyond this many, merges are counted rather than each spelled out. */
const MERGES_SPELLED_OUT = 2

/**
 * What pressing Import will do, as one sentence: “Will create the new
 * Question Bank “Chemistry” and the Test “Unit 3”.”, “Will merge “Physics”
 * into “Year 10 Physics”.” The dialog calls an Exam a Test, the word a
 * teacher uses for the file in hand.
 *
 * `existingName` names a bank already on this device, by id.
 */
export function importSentence(
  proposal: ImportProposal,
  selection: ImportSelection,
  existingName: (bankId: string) => string,
): string {
  const banks = proposal.banks.filter(({ id }) => selection.banks[id]?.allowed)
  const exams = proposal.exams.filter(({ key }) => selection.exams[key]?.allowed)
  if (!banks.length && !exams.length) return t('import.nothingSelected')

  const created = banks.flatMap(({ id }) => {
    const target = selection.banks[id]!.target
    return target.kind === 'new' ? [target.name.trim() || t('bank.untitledName')] : []
  })
  const merged = banks.flatMap(({ id, record }) => {
    const target = selection.banks[id]!.target
    return target.kind === 'existing'
      ? [{ from: record.bank.name || t('bank.untitledName'), into: existingName(target.bankId) }]
      : []
  })

  const creating = [
    ...(created.length === 1 ? [t('import.newBankItem', { name: created[0] })]
      : created.length > 1 ? [t('import.newBanksItem', { count: created.length })] : []),
    ...(exams.length === 1 ? [t('import.testItem', { name: exams[0]!.name || 'Untitled Test' })]
      : exams.length > 1 ? [t('import.testsItem', { count: exams.length })] : []),
  ]
  const listed_ = (parts: string[]) => (parts.length <= 2
    ? parts.join(` ${t('common.andWord')} `)
    : `${parts.slice(0, -1).join(', ')}, ${t('common.andWord')} ${parts.at(-1)}`)
  const create = creating.length ? listed_(creating) : ''
  const merge = !merged.length ? ''
    : merged.length > MERGES_SPELLED_OUT ? t('import.mergeMany', { count: merged.length })
    : listed(merged.map(({ from, into }) => t('import.mergeItem', { from, into })))
  if (!create) return t('import.willMerge', { what: merge })
  if (!merge) return t('import.willCreate', { what: create })
  // Több létrehozandó elem után vessző kell, hogy a második „és” ne a felsorolás
  // részeként olvasódjon.
  return creating.length > 1
    ? t('import.willCreateManyAndMerge', { created: create, merged: merge })
    : t('import.willCreateAndMerge', { created: create, merged: merge })
}
