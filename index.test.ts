import { beforeAll, afterAll, describe, it, expect } from "vitest"
import { ShapeStream } from "./client"
import {
  createServer,
  deleteDb,
  updateRow,
  appendRow,
  lastSnapshotLSN,
} from "./server"
import { v4 as uuidv4 } from "uuid"
import { parse } from "cache-control-parser"
import { schema } from "./test-electric-instance/src/generated/client"
import pg from "pg"
const { Client } = pg

let context = {}

beforeAll(async () => {
  context = {}
  const client = new Client({
    host: `localhost`,
    port: 5532,
    password: `pg_password`,
    user: `postgres`,
    database: `testing-instance`,
  })
  await client.connect()

  const uuid = uuidv4()
  context.rowId = uuid
  try {
    await client.query(`insert into issues(id, title) values($1, $2)`, [
      uuid,
      `foo`,
    ])
  } catch (e) {
    console.log(e)
    throw e
  }
  context.client = client

  // const config = {
  // url: `http://localhost:5233`,
  // }
  const config = {
    url: `http://localhost:5233`,
  }
  context.server = await createServer({ config, schema })
})

afterAll(async () => {
  console.log(`afterAll`)
  context.server.express.close()
  context.server.electric.disconnect()
  deleteDb()
  await context.client.query(`TRUNCATE TABLE issues`)
  await context.client.end()
  context = {}
})

describe(`HTTP Sync`, () => {
  it.only(`should get initial data`, async () => {
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
    const values = [...shapeData.values()]

    expect(values).toHaveLength(1)
    expect(values[0].title).toEqual(`foo`)
  })
  it.only(`should get initial data and then receive updates`, async () => {
    const { rowId, client } = context
    const shapeData = new Map()
    const aborter = new AbortController()
    const issueStream = new ShapeStream({
      subscribe: true,
      signal: aborter.signal,
    })

    let secondRowId = ``
    await new Promise((resolve) => {
      issueStream.subscribe(async (update) => {
        if (update.type === `data`) {
          shapeData.set(update.data.id, update.data)
        }
        if (update.lsn === 0) {
          updateRow({ id: rowId, client, title: `foo1` })
        }
        if (update.lsn === 1) {
          secondRowId = await appendRow({ client, title: `foo2` })
        }

        if (update.lsn === 2) {
          aborter.abort()
          expect(shapeData).toEqual(
            new Map([
              [rowId, { id: rowId, title: `foo1` }],
              [secondRowId, { id: secondRowId, title: `foo2` }],
            ])
          )
          resolve()
        }
      })
    })
    context.secondRowId = secondRowId
  })
  it.only(`Multiple clients can get the same data`, async () => {
    const { rowId, secondRowId, client } = context
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
        if (update.lsn === 2 || update.lsn === 3) {
          setTimeout(() => updateRow({ id: rowId, title: `foo3`, client }), 50)
        }

        if (update.lsn === 3) {
          aborter1.abort()
          expect(shapeData1).toEqual(
            new Map([
              [rowId, { id: rowId, title: `foo3` }],
              [secondRowId, { id: secondRowId, title: `foo2` }],
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
              [rowId, { id: rowId, title: `foo3` }],
              [secondRowId, { id: secondRowId, title: `foo2` }],
            ])
          )
          resolve()
        }
      })
    })

    await Promise.all([promise1, promise2])
  })

  it.only(`can go offline and then catchup`, async () => {
    const { client } = context
    const aborter = new AbortController()
    let lastLsn = 0
    const issueStream = new ShapeStream({
      subscribe: false,
      signal: aborter.signal,
    })
    await new Promise((resolve) => {
      issueStream.subscribe((update) => {
        if (update.lsn) {
          lastLsn = Math.max(lastLsn, update.lsn)
        }

        if (update.type === `up-to-date`) {
          aborter.abort()
          resolve()
        }
      })
    })

    await appendRow({ client, title: `foo4` })
    await appendRow({ client, title: `foo5` })
    await appendRow({ client, title: `foo6` })
    await appendRow({ client, title: `foo7` })
    await appendRow({ client, title: `foo8` })
    // Wait for sqlite to get all the updates.
    await new Promise((resolve) => setTimeout(resolve, 40))

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

  it.only(`should return correct caching headers`, async () => {
    const { client } = context
    const res = await fetch(`http://localhost:3000/shape/issues?lsn=-1`, {})
    const cacheHeaders = res.headers.get(`cache-control`)
    const directives = parse(cacheHeaders)
    expect(directives).toEqual({ "max-age": 60, "stale-while-revalidate": 300 })
    const etag = parseInt(res.headers.get(`etag`), 10)
    expect(etag).toBeTypeOf(`number`)
    expect(etag).toBeLessThan(100)

    await appendRow({ client, title: `foo4` })
    await appendRow({ client, title: `foo5` })
    await appendRow({ client, title: `foo6` })
    await appendRow({ client, title: `foo7` })
    await appendRow({ client, title: `foo8` })
    // Wait for sqlite to get all the updates.
    await new Promise((resolve) => setTimeout(resolve, 40))

    const res2 = await fetch(`http://localhost:3000/shape/issues?lsn=-1`, {})
    const etag2 = parseInt(res2.headers.get(`etag`), 10)
    expect(etag2).toBeTypeOf(`number`)
    expect(etag).toBeLessThan(100)
  })

  it.only(`should revalidate etags`, async () => {
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
