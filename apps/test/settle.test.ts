import { env } from 'cloudflare:workers'
import { http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import type { Evidence } from '../src/evidence'
import { fakeQloo, network, requests } from './fake'
import { openSession, type Session } from './session'

// Synthetic shows: one exact match, one name shared by spin-off feeds, one Qloo doesn't have.
const search = {
  'Night Shift Cinema': [{ entity_id: 'e-0001', name: 'Night Shift Cinema', popularity: 0.91 }],
  'Deep Cuts': [
    { entity_id: 'e-0101', name: 'Deep Cuts: Marvel', popularity: 0.97 },
    { entity_id: 'e-0102', name: 'Deep Cuts: Harry Potter', popularity: 0.62 }
  ],
  'The Ghost Signal Show': [{ entity_id: 'e-0201', name: 'The Ghost Hour Show', popularity: 0.88 }]
}

const open: Session[] = []
const session = async (cookie?: string) => {
  const s = await openSession(cookie)
  open.push(s)
  return s
}
afterEach(() => open.splice(0).forEach((s) => s.close()))

describe('importing a CSV', () => {
  it('fills downloads, status, and description from their columns', async () => {
    fakeQloo({ search })
    const s = await session()
    const csv = [
      'Name,Downloads,Status,Description',
      'Night Shift Cinema,"120,000",active,"Two critics, one late movie."',
      'Deep Cuts,45000,hiatus,',
      '"The Ghost Signal Show",,,"A ""signal"" show"'
    ].join('\r\n')

    await s.importRoster(csv, 'csv')

    expect(
      s.state()?.roster.map(({ name, resolution, downloads, status, description, excluded }) => ({
        name,
        resolution,
        downloads,
        status,
        description,
        excluded
      }))
    ).toEqual([
      {
        name: 'Night Shift Cinema',
        resolution: 'resolved',
        downloads: 120000,
        status: 'active',
        description: 'Two critics, one late movie.',
        excluded: false
      },
      {
        name: 'Deep Cuts',
        resolution: 'ambiguous',
        downloads: 45000,
        status: 'hiatus',
        description: null,
        excluded: false
      },
      {
        name: 'The Ghost Signal Show',
        resolution: 'missed',
        downloads: null,
        status: null,
        description: 'A "signal" show',
        excluded: false
      }
    ])
  })

  it('refuses a CSV without a name column, and keeps the current roster', async () => {
    fakeQloo({ search })
    const s = await session()
    await s.importRoster('Night Shift Cinema')
    requests.length = 0

    await expect(s.importRoster('Show,Downloads\nDeep Cuts,45000', 'csv')).rejects.toThrow(
      'The CSV needs a "name" column. Its first row has "Show", "Downloads".'
    )
    expect(requests).toEqual([])
    expect(s.state()?.roster.map((show) => show.name)).toEqual(['Night Shift Cinema'])
  })

  it('reads a spreadsheet export: a byte-order mark, a line break inside quotes, extra columns', async () => {
    fakeQloo({ search })
    const s = await session()
    await s.importRoster('\uFEFFnotes,name\n"two\nlines",Deep Cuts\n', 'csv')
    expect(s.state()?.roster.map((show) => show.name)).toEqual(['Deep Cuts'])
  })

  it('refuses a CSV that names a show twice, since the rows could disagree', async () => {
    fakeQloo({ search })
    const s = await session()
    await expect(
      s.importRoster('name,downloads\nDeep Cuts,1\nNight Shift Cinema,2\ndeep cuts,3', 'csv')
    ).rejects.toThrow('Rows 2 and 4 of the CSV both name "deep cuts".')
    expect(requests).toEqual([])
  })

  it('refuses a row whose downloads are not a whole number', async () => {
    fakeQloo({ search })
    const s = await session()
    await expect(s.importRoster('name,downloads\nDeep Cuts,lots', 'csv')).rejects.toThrow(
      'Row 2 of the CSV: downloads "lots" isn\'t a whole number.'
    )
    expect(requests).toEqual([])
  })
})

describe('the 50-show limit', () => {
  const names = (n: number) => Array.from({ length: n }, (_, i) => `Show ${i + 1}`)

  it('refuses 51 shows, pasted or in a CSV, before any lookup', async () => {
    fakeQloo({ search })
    const s = await session()
    await s.importRoster('Night Shift Cinema')
    requests.length = 0

    const limit = /51 shows is over the 50-show limit: one comparison scores at most 50 shows/
    await expect(s.importRoster(names(51).join('\n'))).rejects.toThrow(limit)
    await expect(s.importRoster(['name', ...names(51)].join('\n'), 'csv')).rejects.toThrow(limit)
    expect(requests).toEqual([])
    expect(s.state()?.roster.map((show) => show.name)).toEqual(['Night Shift Cinema'])
  })

  it('counts a show once however often it repeats', async () => {
    fakeQloo({ search })
    const s = await session()
    await s.importRoster([...names(50), 'show 1', 'SHOW 2'].join('\n'))
    expect(s.state()?.roster).toHaveLength(50)
  })
})

describe('settling matches', () => {
  const roster = 'Night Shift Cinema\nDeep Cuts\nThe Ghost Signal Show'
  const show = (s: Session, name: string) => s.state()?.roster.find((show) => show.name === name)

  it('resolves an ambiguous show to the candidate the programmer picks, across a reload', async () => {
    fakeQloo({ search })
    const s = await session()
    await s.importRoster(roster)

    await s.call('updateShow', 'Deep Cuts', { entityId: 'e-0102' })

    expect(show(s, 'Deep Cuts')).toMatchObject({
      resolution: 'resolved',
      entity: { id: 'e-0102', name: 'Deep Cuts: Harry Potter', popularity: 0.62 }
    })
    s.close()
    const reloaded = await session(s.cookie)
    expect(show(reloaded, 'Deep Cuts')).toMatchObject({ resolution: 'resolved', entity: { id: 'e-0102' } })
  })

  it('maps a missed show to a comp found by search, citing that search', async () => {
    fakeQloo({
      search: {
        ...search,
        'Ghost Hour': [
          { entity_id: 'e-0201', name: 'The Ghost Hour Show', popularity: 0.88 },
          { entity_id: 'e-0202', name: 'Ghost Hour Live', popularity: 0.31 }
        ]
      }
    })
    const s = await session()
    await s.importRoster(roster)

    await s.searchComps('The Ghost Signal Show', 'Ghost Hour')
    expect(show(s, 'The Ghost Signal Show')).toMatchObject({
      resolution: 'missed',
      evidence: 'C-03',
      compSearch: {
        query: 'Ghost Hour',
        call: 'C-04',
        status: 'done',
        results: [
          { id: 'e-0201', name: 'The Ghost Hour Show', popularity: 0.88 },
          { id: 'e-0202', name: 'Ghost Hour Live', popularity: 0.31 }
        ]
      }
    })
    const comp = requests.at(-1)!.url.searchParams
    expect([comp.get('query'), comp.get('types'), comp.get('take')]).toEqual(['Ghost Hour', 'urn:entity:podcast', '5'])

    await s.call('updateShow', 'The Ghost Signal Show', { compId: 'e-0201' })
    expect(show(s, 'The Ghost Signal Show')).toMatchObject({
      resolution: 'mapped',
      entity: { id: 'e-0201', name: 'The Ghost Hour Show', popularity: 0.88 },
      evidence: 'C-04'
    })

    // A later search that isn't used leaves the mapping and its evidence alone.
    await s.searchComps('The Ghost Signal Show', 'Nothing Like It')
    expect(show(s, 'The Ghost Signal Show')).toMatchObject({
      resolution: 'mapped',
      entity: { id: 'e-0201' },
      evidence: 'C-04',
      compSearch: { query: 'Nothing Like It', call: 'C-05', status: 'done', results: [] }
    })
  })

  it('keeps the latest comp search when an earlier one answers after it', async () => {
    fakeQloo({
      search: { ...search, 'Ghost Hour': [{ entity_id: 'e-0201', name: 'The Ghost Hour Show', popularity: 0.88 }] }
    })
    const s = await session()
    await s.importRoster(roster)
    // Holds the first query until released; returning nothing hands the request on to fakeQloo.
    const held = Promise.withResolvers<void>()
    network.use(
      http.get(`${env.QLOO_BASE_URL}/search`, ({ request }) =>
        new URL(request.url).searchParams.get('query') === 'Ghost Signal' ? held.promise : undefined
      )
    )

    await s.call('searchComps', 'The Ghost Signal Show', 'Ghost Signal')
    await s.searchComps('The Ghost Signal Show', 'Ghost Hour')
    held.resolve()
    // The held search has landed, or been dropped, by the time its evidence is logged.
    while (!(await s.call<Evidence[]>('getEvidence')).some((e) => e.call === 'C-04'))
      await new Promise((resolve) => setTimeout(resolve, 10))

    expect(show(s, 'The Ghost Signal Show')?.compSearch).toMatchObject({
      query: 'Ghost Hour',
      call: 'C-05',
      status: 'done',
      results: [{ id: 'e-0201' }]
    })
  })

  it('leaves a show out by marking it excluded, kept in the roster across a reload', async () => {
    fakeQloo({ search })
    const s = await session()
    await s.importRoster(roster)

    await s.call('updateShow', 'The Ghost Signal Show', { excluded: true })

    const reloaded = await session(s.cookie)
    expect(reloaded.state()?.roster.map(({ name, resolution, excluded }) => [name, resolution, excluded])).toEqual([
      ['Night Shift Cinema', 'resolved', false],
      ['Deep Cuts', 'ambiguous', false],
      ['The Ghost Signal Show', 'missed', true]
    ])
    await reloaded.call('updateShow', 'The Ghost Signal Show', { excluded: false })
    expect(show(reloaded, 'The Ghost Signal Show')?.excluded).toBe(false)
  })

  it("refuses a pick that is not among the show's candidates or comps", async () => {
    fakeQloo({ search })
    const s = await session()
    await s.importRoster(roster)

    await expect(s.call('updateShow', 'Deep Cuts', { entityId: 'e-0001' })).rejects.toThrow(
      "That isn't one of the candidates for Deep Cuts."
    )
    await expect(s.call('updateShow', 'The Ghost Signal Show', { compId: 'e-0201' })).rejects.toThrow(
      "That isn't one of the search results for The Ghost Signal Show."
    )
    await expect(s.call('updateShow', 'Nobody', { excluded: true })).rejects.toThrow('No show named "Nobody"')
    expect(show(s, 'Deep Cuts')).toMatchObject({ resolution: 'ambiguous', entity: null })
  })
})

describe('editing shows and the CPM', () => {
  it('saves downloads, status, and the CPM in synced state, across a reload', async () => {
    fakeQloo({ search })
    const s = await session()
    await s.importRoster('name,downloads,status\nNight Shift Cinema,120000,active', 'csv')
    expect(s.state()?.cpm).toBeNull()

    await s.call('updateShow', 'Night Shift Cinema', { downloads: 95000, status: ' hiatus ' })
    await s.call('setCpm', 22.5)

    const reloaded = await session(s.cookie)
    expect(reloaded.state()?.cpm).toBe(22.5)
    expect(reloaded.state()?.roster[0]).toMatchObject({ downloads: 95000, status: 'hiatus' })

    await reloaded.call('updateShow', 'Night Shift Cinema', { downloads: null, status: '' })
    expect(reloaded.state()?.roster[0]).toMatchObject({ downloads: null, status: null })
  })

  it('refuses a bad value and changes nothing', async () => {
    fakeQloo({ search })
    const s = await session()
    await s.importRoster('name,downloads,status\nNight Shift Cinema,120000,active', 'csv')
    await s.call('setCpm', 20)

    const refusals: [string, unknown[], string][] = [
      [
        'updateShow',
        ['Night Shift Cinema', { status: 'ended', downloads: -5 }],
        'Downloads per episode must be a whole number, 0 or more.'
      ],
      [
        'updateShow',
        ['Night Shift Cinema', { downloads: 1.5 }],
        'Downloads per episode must be a whole number, 0 or more.'
      ],
      ['updateShow', ['Night Shift Cinema', { excluded: 'yes' }], 'Excluded must be true or false.'],
      ['updateShow', ['Night Shift Cinema', { resolution: 'resolved' }], "Can't change resolution"],
      ['setCpm', [0], 'The CPM must be a dollar amount above 0.'],
      ['setCpm', ['20'], 'The CPM must be a dollar amount above 0.']
    ]
    for (const [method, args, message] of refusals) await expect(s.call(method, ...args)).rejects.toThrow(message)

    expect(s.state()?.cpm).toBe(20)
    expect(s.state()?.roster[0]).toMatchObject({
      resolution: 'resolved',
      downloads: 120000,
      status: 'active',
      excluded: false
    })
  })
})
