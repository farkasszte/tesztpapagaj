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

describe('tanulói példány', () => {
  it('a fejléc olvasható, a tartalom nem', () => {
    const { file, json } = encodeStudentBank({ record: record(), files: files(), now: 1000 })
    expect(file.format).toBe(STUDENT_BANK_FORMAT)
    expect(file.name).toBe('Sejtek')
    expect(file.questions).toBe(2)
    // A fejlécben ott a figyelmeztetés, a nyers kérdés-szöveg viszont nem.
    expect(json).toContain('Tanulói példány')
    expect(json).not.toContain('multiple-choice')
    expect(json).not.toContain('test-parrot/question-bank')
  })

  it('oda-vissza ugyanaz a rekord és ugyanazok a képek', () => {
    const { json } = encodeStudentBank({ record: record(), files: files() })
    const back = decodeStudentBank(JSON.parse(json))
    expect(back.record.bank.name).toBe('Sejtek')
    expect(back.record.bank.questions).toHaveLength(2)
    expect(back.name).toBe('Sejtek')
    expect(back.questions).toBe(2)
    expect(Array.from(back.files.get('media/abc123.png') ?? [])).toEqual([137, 80, 78, 71])
  })

  it('a sérült fájlt nem fogadja el', () => {
    const { file } = encodeStudentBank({ record: record(), files: files() })
    const broken = { ...file, checksum: 'deadbeef' }
    expect(() => decodeStudentBank(broken)).toThrow(StudentBankError)
    // A csonkolt tartalom is megbukik az ellenőrző összegen.
    const cut = { ...file, payload: file.payload.slice(0, 20) }
    expect(() => decodeStudentBank(cut)).toThrow(StudentBankError)
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
