import { beforeAll, afterAll, describe, it, expect } from "vitest"
import { ShapeStream } from "./client"
import { createServer, updateRow, appendRow, lastSnapshotLSN } from "./server"
import { parse } from "cache-control-parser"

beforeAll(async (context) => {
  context.server = await createServer()
})

afterAll((context) => {
  context.server.close()
})

describe(`HTTP Sync`, () => {
  it(`should get initial data`, async () => {
    // Get initial data
    const shapeData = new Map()
    const issueStream = new ShapeStream({ subscribe: false })

    await new Promise((resolve) => {
      issueStream.subscribe((update) => {
        if (update.type === `data`) {
          shapeData.set(update.data.id, update.data)
        }
        if (update.type === `up-to-date`) {
          return resolve()
        }
      })
    })

    expect(shapeData).toEqual(
      new Map([[1, { table: `issue`, id: 1, title: `foo1` }]])
    )
  })
  it(`should get initial data and then receive updates`, async () => {
    const shapeData = new Map()
    const aborter = new AbortController()
    const issueStream = new ShapeStream({
      subscribe: true,
      signal: aborter.signal,
    })

    issueStream.subscribe((update) => {
      if (update.type === `data`) {
        shapeData.set(update.data.id, update.data)
      }
      if (update.lsn === 1) {
        setTimeout(() => updateRow(1), 10)
      }
      if (update.lsn === 2) {
        setTimeout(() => appendRow(), 10)
      }

      if (update.lsn === 3) {
        aborter.abort()
        expect(shapeData).toEqual(
          new Map([
            [1, { table: `issue`, id: 1, title: `foo2` }],
            [2, { table: `issue`, id: 2, title: `foo3` }],
          ])
        )
      }
    })
  })
  it(`Multiple clients can get the same data`, async () => {
    const shapeData1 = new Map()
    const aborter1 = new AbortController()
    const issueStream1 = new ShapeStream({
      subscribe: true,
      signal: aborter1.signal,
    })

    const shapeData2 = new Map()
    const aborter2 = new AbortController()
    const issueStream2 = new ShapeStream({
      subscribe: true,
      signal: aborter2.signal,
    })

    const promise1 = new Promise(async (resolve) => {
      issueStream1.subscribe((update) => {
        if (update.type === `data`) {
          shapeData1.set(update.data.id, update.data)
        }
        if (update.lsn === 1 || update.lsn === 2) {
          setTimeout(() => updateRow(1), 50)
        }

        if (update.lsn === 3) {
          aborter1.abort()
          expect(shapeData1).toEqual(
            new Map([
              [1, { table: `issue`, id: 1, title: `foo2` }],
              [2, { table: `issue`, id: 2, title: `foo3` }],
            ])
          )
          resolve()
        }
      })
    })

    const promise2 = new Promise(async (resolve) => {
      issueStream2.subscribe((update) => {
        if (update.type === `data`) {
          shapeData2.set(update.data.id, update.data)
        }

        if (update.lsn === 3) {
          aborter2.abort()
          expect(shapeData2).toEqual(
            new Map([
              [1, { table: `issue`, id: 1, title: `foo2` }],
              [2, { table: `issue`, id: 2, title: `foo3` }],
            ])
          )
          resolve()
        }
      })
    })

    await Promise.all([promise1, promise2])
  })

  it(`can go offline and then catchup`, async () => {
    const shapeData = new Map()
    const aborter = new AbortController()
    let lastLsn = 0
    const issueStream = new ShapeStream({
      subscribe: true,
      signal: aborter.signal,
    })
    await new Promise((resolve) => {
      issueStream.subscribe((update) => {
        if (update.lsn) {
          lastLsn = update.lsn
        }
        if (update.type === `data`) {
          shapeData.set(update.data.id, update.data)
        }
        if (update.lsn === 1 || update.lsn === 2) {
          setTimeout(() => updateRow(1), 10)
        }

        if (update.lsn === 3) {
          aborter.abort()
          resolve()
        }
      })
    })

    updateRow(1)
    updateRow(1)
    updateRow(1)
    updateRow(1)
    updateRow(1)

    let catchupOpsCount = 0
    const newAborter = new AbortController()
    const newIssueStream = new ShapeStream({
      subscribe: true,
      signal: newAborter.signal,
      lsn: lastLsn,
    })
    await new Promise((resolve) => {
      newIssueStream.subscribe((update) => {
        if (update.type === `data`) {
          catchupOpsCount += 1
        }
        if (update.type === `up-to-date`) {
          newAborter.abort()
          resolve()
        }
      })
    })

    expect(catchupOpsCount).toBe(5)
  })

  it(`the server compacts the initial snapshot when enough new ops have been added`, async () => {
    const startLSN = lastSnapshotLSN
    updateRow(1)
    updateRow(1)
    updateRow(1)
    updateRow(1)
    updateRow(1)
    let lastLsn = 0
    const issueStream = new ShapeStream()
    await new Promise((resolve) => {
      issueStream.subscribe((update) => {
        if (update.type === `data`) {
          lastLsn = update.lsn
        }
        if (update.type === `up-to-date`) {
          resolve()
        }
      })
    })
    expect(lastLsn - startLSN).toBe(5)
  })
  it(`should return correct caching headers`, async () => {
    const res = await fetch(`http://localhost:3000/shape/issues?lsn=-1`, {})
    const cacheHeaders = res.headers.get(`cache-control`)
    const directives = parse(cacheHeaders)
    expect(directives).toEqual({ "max-age": 60, "stale-while-revalidate": 300 })
    const etag = parseInt(res.headers.get(`etag`), 10)
    expect(etag).toBeTypeOf(`number`)
    expect(etag).toBeLessThan(100)
    updateRow(1)
    updateRow(1)
    updateRow(1)
    updateRow(1)
    updateRow(1)
    const res2 = await fetch(`http://localhost:3000/shape/issues?lsn=-1`, {})
    const etag2 = parseInt(res2.headers.get(`etag`), 10)
    expect(etag2).toBeTypeOf(`number`)
    expect(etag).toBeLessThan(100)
  })

  it(`should revalidate etags`, async () => {
    const res = await fetch(`http://localhost:3000/shape/issues?lsn=-1`, {})
    const etag = res.headers.get(`etag`)

    const etagValidation = await fetch(
      `http://localhost:3000/shape/issues?lsn=-1`,
      {
        headers: { "if-None-Else": etag },
      }
    )

    const status = etagValidation.status
    expect(status).toEqual(304)

    // Get etag for catchup
    const catchupEtagRes = await fetch(
      `http://localhost:3000/shape/issues?lsn=4`,
      {}
    )
    const catchupEtag = catchupEtagRes.headers.get(`etag`)

    // Catch-up LSNs should also use the same etag as they're
    // also working through the end of the current log.
    const catchupEtagValidation = await fetch(
      `http://localhost:3000/shape/issues?lsn=${etag}`,
      {
        headers: { "if-None-Else": catchupEtag },
      }
    )
    const catchupStatus = catchupEtagValidation.status
    expect(catchupStatus).toEqual(304)
  })
})
