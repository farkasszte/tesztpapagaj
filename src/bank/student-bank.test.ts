import { describe, expect, it } from 'bun:test'
import type { QuestionBankRecord } from '../export/question-bank-export'
import {
  STUDENT_BANK_FORMAT,
  StudentBankError,
  decodeStudentBank,
  encodeStudentBank,
  isStudentBankFile,
  studentBankFileName,
} from './student-bank'

const record = (name = 'Sejtek'): QuestionBankRecord =>
  ({
    format: 'test-parrot/question-bank',
    formatVersion: '0.13.0',
    generator: { name: 'Test Parrot', version: '1.0.0' },
    requiredFeatures: [],
    bank: {
      name,
      questions: [
        { id: 'q1', type: 'multiple-choice', doc: { type: 'document', content: [] } },
        { id: 'q2', type: 'multiple-choice', doc: { type: 'document', content: [] } },
      ],
    },
    media: [
      {
        id: 'sha256:abc123',
        mimeType: 'image/png',
        width: 8,
        height: 8,
        file: 'media/abc123.png',
      },
    ],
  }) as unknown as QuestionBankRecord

const files = () => new Map([['media/abc123.png', new Uint8Array([137, 80, 78, 71])]])

/** Az 1-es változat: sima base64, gzip nélkül (a régi fájlok alakja). */
function legacyFile(record: QuestionBankRecord, now = 1000) {
  const body = JSON.stringify({
    record,
    assets: record.media.map((media) => ({ ...media, data: 'iVBORw==' })),
  })
  const payload = btoa(String.fromCharCode(...new TextEncoder().encode(body)))
  let hash = 0x811c9dc5
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return {
    format: STUDENT_BANK_FORMAT,
    version: 1,
    notice: 'Tanulói példány',
    name: record.bank.name,
    questions: record.bank.questions.length,
    createdAt: now,
    checksum: hash.toString(16).padStart(8, '0'),
    payload,
  }
}

describe('tanulói példány', () => {
  it('a fejléc olvasható, a tartalom nem', async () => {
    const { file, json } = await encodeStudentBank({ record: record(), files: files(), now: 1000 })
    expect(file.format).toBe(STUDENT_BANK_FORMAT)
    expect(file.version).toBe(2)
    expect(file.encoding).toBe('gzip+base64')
    expect(file.name).toBe('Sejtek')
    expect(file.questions).toBe(2)
    // A fejlécben ott a figyelmeztetés, a nyers kérdés-szöveg viszont nem.
    expect(json).toContain('Tanulói példány')
    expect(json).not.toContain('multiple-choice')
    expect(json).not.toContain('test-parrot/question-bank')
  })

  it('oda-vissza ugyanaz a rekord és ugyanazok a képek', async () => {
    const { json } = await encodeStudentBank({ record: record(), files: files(), bankKey: 'bank-1' })
    const back = await decodeStudentBank(JSON.parse(json))
    expect(back.record.bank.name).toBe('Sejtek')
    expect(back.record.bank.questions).toHaveLength(2)
    expect(back.name).toBe('Sejtek')
    expect(back.questions).toBe(2)
    expect(back.bankKey).toBe('bank-1')
    expect(Array.from(back.files.get('media/abc123.png') ?? [])).toEqual([137, 80, 78, 71])
  })

  it('a tömörített fájl kisebb, mint a base64-es', async () => {
    const big = record('Nagy bank')
    big.bank.questions = Array.from({ length: 60 }, (_, index) => ({
      id: `q${index}`,
      type: 'multiple-choice',
      doc: {
        type: 'document',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Ismétlődő kérdés szövege a tömörítés méréséhez.' }],
          },
        ],
      },
    })) as never
    const packed = await encodeStudentBank({ record: big, files: files(), now: 1000 })
    const legacy = legacyFile(big)
    expect(packed.file.version).toBe(2)
    expect(packed.file.payload.length).toBeLessThan(legacy.payload.length)
  })

  it('a régi (1-es) fájlt is beolvassa', async () => {
    const back = await decodeStudentBank(legacyFile(record()))
    expect(back.record.bank.name).toBe('Sejtek')
    expect(back.bankKey).toBeUndefined()
  })

  it('a sérült fájlt nem fogadja el', async () => {
    const { file } = await encodeStudentBank({ record: record(), files: files() })
    const broken = { ...file, checksum: 'deadbeef' }
    await expect(decodeStudentBank(broken)).rejects.toBeInstanceOf(StudentBankError)
    const cut = { ...file, payload: file.payload.slice(0, 20) }
    await expect(decodeStudentBank(cut)).rejects.toBeInstanceOf(StudentBankError)
  })

  it('más JSON-t (közönséges kérdésbankot) nem ismer fel tanulóinak', () => {
    expect(isStudentBankFile({ format: 'test-parrot/question-bank' })).toBe(false)
    expect(isStudentBankFile(null)).toBe(false)
    expect(isStudentBankFile({ format: STUDENT_BANK_FORMAT })).toBe(false)
  })

  it('a mentett fájlnév a bank nevét viszi, és jelzi a fajtáját', () => {
    expect(studentBankFileName('Sejtek / osztódás')).toBe('Sejtek osztódás (gyakorlo).json')
    expect(studentBankFileName('   ')).toBe('gyakorlo-bank (gyakorlo).json')
  })
})
