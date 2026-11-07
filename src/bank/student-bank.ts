import type { QuestionBankRecord } from '../export/question-bank-export'

/**
 * Tanulói példány („gyakorló bank") — egy kérdésbank megosztásra szánt
 * változata, szerver nélkül.
 *
 * A fájl **fejléce olvasható** (a program és a tanár is látja, mi ez), a
 * tartalom pedig **base64-ben** van: szabad szemmel nem olvasható, de nem is
 * titkosítás — aki akarja, visszafejtheti. Ez szándékos: a cél az, hogy a diák
 * ne a nyers szöveget lássa, ne a válaszokat böngéssze a fájlban, és hogy a
 * program felismerje a fájlt importálás előtt.
 *
 * Az importált bank `student: true` jelzést kap: nem szerkeszthető, nem
 * nyitható meg, csak tanulókártya és gyakorló mód indul belőle.
 */

export const STUDENT_BANK_FORMAT = 'testparrot/student-bank'
export const STUDENT_BANK_VERSION = 1

/** A fejlécben olvasható mondat: a tanár és a diák is érti, mi ez a fájl. */
export const STUDENT_BANK_NOTICE =
  'Tanulói példány — csak gyakorlásra. Szerkesztésre nem való, a tanár példánya külön fájl.'

export type StudentBankFile = {
  format: typeof STUDENT_BANK_FORMAT
  version: typeof STUDENT_BANK_VERSION
  notice: string
  /** A bank neve: ennyi olvasható a fejlécben (a felismeréshez és a listához). */
  name: string
  /** Hány kérdés van benne — importálás előtt is látszik. */
  questions: number
  createdAt: number
  /** A tartalom ellenőrző összege: csonkult vagy átírt fájlt kiszúrja. */
  checksum: string
  /** base64(UTF-8 JSON) — a kérdések és a képek. */
  payload: string
}

export type StudentBankBody = {
  record: QuestionBankRecord
  /** A rekord által hivatkozott képek, a rekordban megadott útvonalon. */
  files: Map<string, Uint8Array>
}

export class StudentBankError extends Error {}

/** FNV-1a 32 bit: elég a csonkulás és az átírás kiszúrására, nem titkosítás. */
function checksumOf(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  // Darabolva, mert a `String.fromCharCode(...bytes)` egy nagy fájlnál elszáll.
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/** A tanulói fájl neve: a böngésző ezt ajánlja mentéskor. */
export function studentBankFileName(name: string): string {
  const base = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 60)
  return `${base || 'gyakorlo-bank'} (gyakorlo).json`
}

/** Egy bankból tanulói fájl: a fejléc olvasható, a tartalom base64. */
export function encodeStudentBank(input: {
  record: QuestionBankRecord
  files: ReadonlyMap<string, Uint8Array>
  now?: number
}): { file: StudentBankFile; json: string } {
  const assets = input.record.media.map((media) => {
    const bytes = input.files.get(media.file)
    if (!bytes) throw new StudentBankError(`Hiányzó kép: ${media.file}`)
    return { ...media, data: toBase64(bytes) }
  })
  const body = JSON.stringify({ record: input.record, assets })
  const payload = toBase64(new TextEncoder().encode(body))
  const file: StudentBankFile = {
    format: STUDENT_BANK_FORMAT,
    version: STUDENT_BANK_VERSION,
    notice: STUDENT_BANK_NOTICE,
    name: input.record.bank.name,
    questions: input.record.bank.questions.length,
    createdAt: input.now ?? Date.now(),
    checksum: checksumOf(payload),
    payload,
  }
  return { file, json: JSON.stringify(file, null, 2) }
}

export function isStudentBankFile(value: unknown): value is StudentBankFile {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<StudentBankFile>
  return candidate.format === STUDENT_BANK_FORMAT && typeof candidate.payload === 'string'
}

/** A tanulói fájl kicsomagolása; hibánál `StudentBankError` a magyar okkal. */
export function decodeStudentBank(value: unknown): StudentBankBody & { name: string; questions: number } {
  if (!isStudentBankFile(value)) throw new StudentBankError('Ez nem tanulói példány.')
  if (value.version !== STUDENT_BANK_VERSION) {
    throw new StudentBankError('A tanulói példány újabb változatban készült — frissítsd az oldalt.')
  }
  if (checksumOf(value.payload) !== value.checksum) {
    throw new StudentBankError('A fájl sérült: az ellenőrző összeg nem egyezik.')
  }
  let parsed: { record?: QuestionBankRecord; assets?: (QuestionBankRecord['media'][number] & { data: string })[] }
  try {
    parsed = JSON.parse(new TextDecoder().decode(fromBase64(value.payload))) as typeof parsed
  } catch {
    throw new StudentBankError('A fájl tartalma nem olvasható.')
  }
  if (!parsed.record || !Array.isArray(parsed.assets)) {
    throw new StudentBankError('A fájl tartalma hiányos.')
  }
  const files = new Map<string, Uint8Array>()
  for (const asset of parsed.assets) files.set(asset.file, fromBase64(asset.data))
  return {
    record: parsed.record,
    files,
    name: value.name || parsed.record.bank.name,
    questions: parsed.record.bank.questions.length,
  }
}
