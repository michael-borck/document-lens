import { describe, it, expect, afterEach, vi } from 'vitest'
import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver } from './db'
import { getProject, listProjects } from './projects'
import { listDocuments } from './documents'
import { exportProjectBundle } from './bundle-project-export'
import { applyBundle, readBundlePreview } from './bundle-project-import'

// Backs US-X-02 / US-X-03 (.lens bundle export + import). Exercises the full
// round-trip on the seam that matters for the DSR reproducibility claim: a
// project exported on one machine must re-materialise on a *fresh* database.
// window.electron file I/O is mocked so writeFile captures the bundle bytes and
// readFile hands them back — the zip + serialisation are the real code paths.

let t: TestDb
let stored: Uint8Array | null = null

const BUNDLE_PATH = '/tmp/roundtrip.lens'

function mockElectron() {
  stored = null
  vi.stubGlobal('window', {
    electron: {
      saveFileDialog: async () => ({ canceled: false, filePath: BUNDLE_PATH }),
      writeFile: async (_path: string, data: ArrayBuffer) => {
        stored = new Uint8Array(data)
      },
      readFile: async () => stored,
      getPath: async () => '/tmp',
    },
  })
}

afterEach(() => {
  t?.close()
  resetDbDriver()
  vi.unstubAllGlobals()
})

/** Seed a small but complete project: keywords (tagged), an axis, a document. */
function seedSenderProject(): string {
  t = createTestDb()
  setDbDriver(t.driver)
  const pid = t.project({ name: 'Sender Project' })

  const list = t.keywordList({ name: 'SDG list' })
  t.projectKeywordList(pid, list)

  const axis = t.lens({ name: 'Pillar', type: 'keyword-attached' })
  const biosphere = t.lensValue(axis, 'Biosphere')
  t.declareListLens(list, axis)
  t.projectLens(pid, axis)

  const climate = t.keyword(list, 'climate')
  t.keywordTag(climate, axis, biosphere)
  t.keyword(list, 'greenwashing', 'counter')

  const doc = t.document({
    filename: 'report.pdf',
    title: 'Annual Report',
    year: 2023,
    extractedText: 'climate action across the organisation',
  })
  t.addDocToProject(pid, doc)
  return pid
}

/** Tear down the sender DB and stand up an empty receiver DB. */
function switchToFreshDatabase() {
  t.close()
  resetDbDriver()
  t = createTestDb()
  setDbDriver(t.driver)
}

describe('.lens bundle round-trip', () => {
  it('exports a project and re-imports it onto a fresh database', async () => {
    mockElectron()
    const pid = seedSenderProject()
    const project = await getProject(pid)
    expect(project).not.toBeNull()

    const exportResult = await exportProjectBundle(project!, { includeFiles: false })
    expect('filePath' in exportResult && exportResult.filePath).toBe(BUNDLE_PATH)
    expect(stored).toBeTruthy()
    expect(stored!.byteLength).toBeGreaterThan(0)

    // Simulate a different machine.
    switchToFreshDatabase()
    expect(await listProjects()).toHaveLength(0)

    const result = await applyBundle(BUNDLE_PATH)
    expect(result.project.name).toBe('Sender Project')
    expect(result.newDocumentCount).toBe(1)
    expect(result.newKeywordCount).toBe(2)
    expect(result.newAxisCount).toBeGreaterThanOrEqual(1)

    // The receiver DB now holds the project + its document.
    const projects = await listProjects()
    expect(projects).toHaveLength(1)
    expect(projects[0].name).toBe('Sender Project')

    const docs = await listDocuments()
    expect(docs).toHaveLength(1)
    expect(docs[0].title).toBe('Annual Report')
    expect(docs[0].year).toBe(2023)
    // No source file was bundled → synthetic "source unavailable" path.
    expect(docs[0].filePath.startsWith('lens-bundle://')).toBe(true)
  })

  it('previews a bundle without writing to the database', async () => {
    mockElectron()
    const pid = seedSenderProject()
    const project = await getProject(pid)
    await exportProjectBundle(project!, { includeFiles: false })

    switchToFreshDatabase()
    const preview = await readBundlePreview(BUNDLE_PATH)
    expect(preview.project.name).toBe('Sender Project')
    // Preview must not have created anything.
    expect(await listProjects()).toHaveLength(0)
  })

  it('re-imports as a second copy rather than overwriting on a populated database', async () => {
    mockElectron()
    const pid = seedSenderProject()
    const project = await getProject(pid)
    await exportProjectBundle(project!, { includeFiles: false })

    // Import back into the SAME database that still holds the original.
    const result = await applyBundle(BUNDLE_PATH)
    expect(result.project.id).not.toBe(pid) // fresh id, not a clobber
    const projects = await listProjects()
    expect(projects).toHaveLength(2)
  })
})
