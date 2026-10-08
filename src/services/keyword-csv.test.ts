import { describe, it, expect, afterEach } from 'vitest'
import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver } from './db'
import { keywordListToCsv, csvToNewKeywordList } from './keyword-csv'
import { listKeywordLists, listKeywords, listKeywordTags, listSynonyms } from './keyword-lists'
import { listAxisValues } from './axes'

let t: TestDb
afterEach(() => {
  t?.close()
  resetDbDriver()
})

function withDb(): TestDb {
  t = createTestDb()
  setDbDriver(t.driver)
  return t
}

describe('keyword CSV export/import', () => {
  it('round-trips text, polarity, enabled, notes, synonyms, and lens tags', async () => {
    const db = withDb()
    const pillar = db.lens({ name: 'Pillar', type: 'keyword-attached' })
    const bio = db.lensValue(pillar, 'biosphere', { displayName: 'Biosphere' })
    const soc = db.lensValue(pillar, 'society', { displayName: 'Society' })

    const list = db.keywordList({ name: 'Source', type: 'custom' })
    db.declareListLens(list, pillar)

    const k1 = db.keyword(list, 'climate action', 'positive', { enabled: true })
    db.keywordTag(k1, pillar, bio)
    db.synonym(k1, 'global warming')
    db.synonym(k1, 'carbon reduction')

    const k2 = db.keyword(list, 'greenwashing', 'counter', { enabled: false, matchMode: 'prefix' })
    db.keywordTag(k2, pillar, soc)

    const csv = await keywordListToCsv(list)
    expect(csv.split('\n')[0]).toBe('text,polarity,enabled,notes,synonyms,match_mode,Pillar')

    const summary = await csvToNewKeywordList(csv, 'Copy')
    expect(summary.keywordsCreated).toBe(2)
    expect(summary.synonymsCreated).toBe(2)
    expect(summary.tagsApplied).toBe(2)
    expect(summary.ignoredColumns).toEqual([])
    expect(summary.unmatchedTagValues).toEqual([])

    const newList = (await listKeywordLists()).find((l) => l.name === 'Copy')!
    expect(newList).toBeDefined()
    const kws = await listKeywords(newList.id)
    const byText = Object.fromEntries(kws.map((k) => [k.text, k]))

    expect(byText['climate action'].polarity).toBe('positive')
    expect(byText['climate action'].enabled).toBe(true)
    expect(byText['climate action'].matchMode).toBe('exact')
    expect(byText['greenwashing'].polarity).toBe('counter')
    expect(byText['greenwashing'].enabled).toBe(false)
    expect(byText['greenwashing'].matchMode).toBe('prefix')

    // tags re-resolved to the same lens value codes
    const tags = await listKeywordTags(byText['climate action'].id)
    const vals = await listAxisValues(pillar)
    const codeById = Object.fromEntries(vals.map((v: { id: string; value: string }) => [v.id, v.value]))
    expect(tags.map((tg) => codeById[tg.valueId])).toEqual(['biosphere'])

    const syns = (await listSynonyms(byText['climate action'].id)).map((s) => s.text).sort()
    expect(syns).toEqual(['carbon reduction', 'global warming'])
  })

  it('reverses the formula-injection guard so +ve / -ve round-trip', async () => {
    withDb()
    const csv = 'text,polarity\n"+ve signal",positive\n"-ve signal",counter'
    await csvToNewKeywordList(csv, 'Edge')
    const list = (await listKeywordLists()).find((l) => l.name === 'Edge')!
    const texts = (await listKeywords(list.id)).map((k) => k.text).sort()
    expect(texts).toEqual(['+ve signal', '-ve signal'])
  })

  it('imports a minimal CSV (text only) and reports unknown columns', async () => {
    withDb()
    const csv = 'text,Mystery\nclean energy,xyz'
    const summary = await csvToNewKeywordList(csv, 'Minimal')
    expect(summary.keywordsCreated).toBe(1)
    expect(summary.ignoredColumns).toEqual(['Mystery'])
    const list = (await listKeywordLists()).find((l) => l.name === 'Minimal')!
    const kws = await listKeywords(list.id)
    expect(kws[0].text).toBe('clean energy')
    expect(kws[0].polarity).toBe('positive') // default
    expect(kws[0].matchMode).toBe('exact') // default — column absent
  })

  it('parses match_mode forgivingly: prefix/stem honoured, junk → exact', async () => {
    withDb()
    const csv = 'text,match_mode\nsustainability,prefix\nenergy,stem\nclimate,junk'
    await csvToNewKeywordList(csv, 'Modes')
    const list = (await listKeywordLists()).find((l) => l.name === 'Modes')!
    const byText = Object.fromEntries((await listKeywords(list.id)).map((k) => [k.text, k]))
    expect(byText['sustainability'].matchMode).toBe('prefix')
    expect(byText['energy'].matchMode).toBe('prefix') // 'stem' accepted as an alias
    expect(byText['climate'].matchMode).toBe('exact')
  })

  it('appends a suffix instead of clobbering an existing list name', async () => {
    const db = withDb()
    db.keywordList({ name: 'Dup', type: 'custom' })
    const summary = await csvToNewKeywordList('text\nfoo', 'Dup')
    expect(summary.listName).toBe('Dup (imported)')
  })
})
