import { beforeEach, describe, expect, test } from 'bun:test'
import {
  FOLDERS_KEY,
  MAX_FOLDERS,
  createFolder,
  folderOf,
  foldersOf,
  itemsIn,
  placeInFolder,
  removeFolder,
  renameFolder,
} from './folders'

class Memory implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
}

let counter = 0
const nextId = () => `f${(counter += 1)}`

beforeEach(() => {
  counter = 0
  // A teljes futásban egy másik teszt getterrel tehette rá a tárolót: a
  // `defineProperty` mindkét esetben felülírja, a sima értékadás nem.
  Object.defineProperty(globalThis, 'localStorage', {
    value: new Memory(),
    configurable: true,
    writable: true,
  })
})

describe('mappák', () => {
  test('mappa létrehozása, név tisztítása, ismétlés kizárása', () => {
    const folder = createFolder('question-banks', '  Első   félév ', 1000, nextId)
    expect(folder?.name).toBe('Első félév')
    expect(createFolder('question-banks', 'első FÉLÉV', 2000, nextId)).toBeNull()
    expect(createFolder('question-banks', '   ', 2000, nextId)).toBeNull()
    // Ugyanaz a név a dolgozatoknál megengedett: külön gyűjtemény.
    expect(createFolder('exams', 'Első félév', 3000, nextId)?.kind).toBe('exams')
  })

  test('a bank és a dolgozat helye nem keveredik', () => {
    const bankFolder = createFolder('question-banks', 'Bankok', 1000, nextId)!
    const examFolder = createFolder('exams', 'Dolgozatok', 2000, nextId)!
    placeInFolder('question-banks', 'b1', bankFolder.id)
    placeInFolder('exams', 'b1', examFolder.id)
    expect(folderOf('question-banks', 'b1')).toBe(bankFolder.id)
    expect(folderOf('exams', 'b1')).toBe(examFolder.id)
    expect(itemsIn('question-banks', bankFolder.id)).toEqual(['b1'])
    expect(itemsIn('question-banks', examFolder.id)).toEqual([])
  })

  test('áthelyezés és kivétel a mappából', () => {
    const first = createFolder('question-banks', 'Egy', 1000, nextId)!
    const second = createFolder('question-banks', 'Kettő', 2000, nextId)!
    placeInFolder('question-banks', 'b1', first.id)
    placeInFolder('question-banks', 'b1', second.id)
    expect(itemsIn('question-banks', first.id)).toEqual([])
    expect(itemsIn('question-banks', second.id)).toEqual(['b1'])
    placeInFolder('question-banks', 'b1', null)
    expect(folderOf('question-banks', 'b1')).toBeNull()
  })

  test('idegen gyűjtemény mappájába nem kerül elem', () => {
    const examFolder = createFolder('exams', 'Dolgozatok', 1000, nextId)!
    placeInFolder('question-banks', 'b1', examFolder.id)
    expect(folderOf('question-banks', 'b1')).toBeNull()
  })

  test('átnevezés, és a mappa törlése nem viszi el a tartalmat', () => {
    const folder = createFolder('question-banks', 'Régi', 1000, nextId)!
    expect(renameFolder(folder.id, '  Új  név ')?.name).toBe('Új név')
    expect(renameFolder(folder.id, '   ')).toBeNull()
    placeInFolder('question-banks', 'b1', folder.id)
    removeFolder(folder.id)
    expect(foldersOf('question-banks')).toEqual([])
    expect(folderOf('question-banks', 'b1')).toBeNull()
  })

  test('a mappák száma korlátos', () => {
    for (let index = 0; index < MAX_FOLDERS; index += 1) {
      expect(createFolder('question-banks', `Mappa ${index}`, index, nextId)).not.toBeNull()
    }
    expect(createFolder('question-banks', 'Egy a sok közül', 999, nextId)).toBeNull()
    expect(foldersOf('question-banks')).toHaveLength(MAX_FOLDERS)
  })

  test('sérült tárolt tartalom nem töri el a listát', () => {
    localStorage.setItem(FOLDERS_KEY, '{ nem json')
    expect(foldersOf('question-banks')).toEqual([])
    localStorage.setItem(FOLDERS_KEY, '{"folders":[{"id":1}],"places":"nem"}')
    expect(foldersOf('question-banks')).toEqual([])
    expect(folderOf('question-banks', 'b1')).toBeNull()
  })
})
