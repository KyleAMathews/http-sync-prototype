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
  //
  // Add an initial row.
  const uuid = uuidv4()
  try {
    await client.query(`insert into foo(id, title) values($1, $2)`, [
      uuid,
      `I AM FOO TABLE`,
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
  await context.client.query(`TRUNCATE TABLE foo`)
  await context.client.end()
  context = {}
})

describe(`HTTP Sync`, () => {
  it(`should work with empty shapes`, async () => {
    // Get initial data
    const shapeData = new Map()
    const issueStream = new ShapeStream({
      shape: { table: `issues` },
      subscribe: false,
    })

    await new Promise((resolve) => {
      issueStream.subscribe((update) => {
        if (update.type === `data`) {
          shapeData.set(update.data.id, update.data)
        }
        if (update.type === `control` && update.data === `up-to-date`) {
          return resolve()
        }
      })
    })
    const values = [...shapeData.values()]

    expect(values).toHaveLength(0)
  })
  it(`should get initial data`, async () => {
    const { client } = context
    // Add an initial row.
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
    // Wait for sqlite to get all the updates.
    await new Promise((resolve) => setTimeout(resolve, 40))

    // Get initial data
    const shapeData = new Map()
    const issueStream = new ShapeStream({
      shape: { table: `issues` },
      subscribe: false,
    })

    await new Promise((resolve) => {
      issueStream.subscribe((update) => {
        if (update.type === `data`) {
          shapeData.set(update.data.id, update.data)
        }
        if (update.type === `control` && update.data === `up-to-date`) {
          return resolve()
        }
      })
    })
    const values = [...shapeData.values()]

    expect(values).toHaveLength(1)
    expect(values[0].title).toEqual(`foo`)
  })
  it(`should get initial data for a second table`, async () => {
    const { client } = context

    // Get initial data
    const shapeData = new Map()
    const fooStream = new ShapeStream({
      shape: { table: `foo` },
      subscribe: false,
    })

    await new Promise((resolve) => {
      fooStream.subscribe((update) => {
        if (update.type === `data`) {
          shapeData.set(update.data.id, update.data)
        }
        if (update.type === `control` && update.data === `up-to-date`) {
          return resolve()
        }
      })
    })
    const values = [...shapeData.values()]

    expect(values).toHaveLength(1)
    expect(values[0].title).toEqual(`I AM FOO TABLE`)
  })
  it(`should get initial data and then receive updates`, async () => {
    const { rowId } = context
    const shapeData = new Map()
    const aborter = new AbortController()
    const issueStream = new ShapeStream({
      shape: { table: `issues` },
      subscribe: true,
      signal: aborter.signal,
    })

    let secondRowId = ``
    let batchDoneCount = 0
    await new Promise((resolve) => {
      issueStream.subscribe(async (update) => {
        if (update.type === `control` && update.data === `batch-done`) {
          batchDoneCount += 1
        }
        if (update.type === `data`) {
          shapeData.set(update.data.id, update.data)
        }
        if (update.lsn === 1) {
          updateRow({ id: rowId, title: `foo1` })
        }
        if (update.lsn === 2) {
          secondRowId = await appendRow({ title: `foo2` })
        }

        if (update.lsn === 3) {
          aborter.abort()
          expect(shapeData).toEqual(
            new Map([
              [rowId, { id: rowId, title: `foo1` }],
              [secondRowId, { id: secondRowId, title: `foo2` }],
            ])
          )
          expect(batchDoneCount).toEqual(3)
          resolve()
        }
      })
    })
    context.secondRowId = secondRowId
  })
  it(`Multiple clients can get the same data`, async () => {
    const { rowId, secondRowId } = context
    const shapeData1 = new Map()
    const aborter1 = new AbortController()
    const issueStream1 = new ShapeStream({
      shape: { table: `issues` },
      subscribe: true,
      signal: aborter1.signal,
    })

    const shapeData2 = new Map()
    const aborter2 = new AbortController()
    const issueStream2 = new ShapeStream({
      shape: { table: `issues` },
      subscribe: true,
      signal: aborter2.signal,
    })

    const promise1 = new Promise(async (resolve) => {
      issueStream1.subscribe((update) => {
        if (update.type === `data`) {
          shapeData1.set(update.data.id, update.data)
        }
        if (update.lsn === 3) {
          setTimeout(() => updateRow({ id: rowId, title: `foo3` }), 50)
        }

        if (update.lsn === 4) {
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

        if (update.lsn === 4) {
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

  it(`can go offline and then catchup`, async () => {
    const aborter = new AbortController()
    let lastLsn = 0
    const issueStream = new ShapeStream({
      shape: { table: `issues` },
      subscribe: false,
      signal: aborter.signal,
    })
    await new Promise((resolve) => {
      issueStream.subscribe((update) => {
        if (update.lsn) {
          lastLsn = Math.max(lastLsn, update.lsn)
        }

        if (update.type === `control` && update.data === `up-to-date`) {
          aborter.abort()
          resolve()
        }
      })
    })

    const id = await appendRow({ title: `foo5` })
    await appendRow({ title: `foo6` })
    await appendRow({ title: `foo7` })
    await appendRow({ title: `foo8` })
    await appendRow({ title: `foo9` })
    await appendRow({ title: `foo10` })
    await appendRow({ title: `foo11` })
    await appendRow({ title: `foo12` })
    await appendRow({ title: `foo13` })
    await new Promise((resolve) => setTimeout(resolve, 10))
    // Add update — which the server should then overwrite the original appendRow
    // meaning there won't be an extra operation.
    updateRow({ id, title: `--foo5` })
    // Wait for sqlite to get all the updates.
    await new Promise((resolve) => setTimeout(resolve, 60))

    let catchupOpsCount = 0
    const newAborter = new AbortController()
    const newIssueStream = new ShapeStream({
      shape: { table: `issues` },
      subscribe: true,
      signal: newAborter.signal,
      lsn: lastLsn,
    })
    await new Promise((resolve) => {
      newIssueStream.subscribe((update) => {
        if (update.type === `data`) {
          catchupOpsCount += 1
        }
        if (update.type === `control` && update.data === `up-to-date`) {
          newAborter.abort()
          resolve()
        }
      })
    })

    expect(catchupOpsCount).toBe(9)
  })

  it(`should return correct caching headers`, async () => {
    const res = await fetch(`http://localhost:3000/shape/issues?lsn=-1`, {})
    const cacheHeaders = res.headers.get(`cache-control`)
    const directives = parse(cacheHeaders)
    expect(directives).toEqual({ "max-age": 60, "stale-while-revalidate": 300 })
    const etag = parseInt(res.headers.get(`etag`), 10)
    expect(etag).toBeTypeOf(`number`)
    expect(etag).toBeLessThan(100)

    await appendRow({ title: `foo4` })
    await appendRow({ title: `foo5` })
    await appendRow({ title: `foo6` })
    await appendRow({ title: `foo7` })
    await appendRow({ title: `foo8` })
    // Wait for sqlite to get all the updates.
    await new Promise((resolve) => setTimeout(resolve, 40))

    const res2 = await fetch(`http://localhost:3000/shape/issues?lsn=-1`, {})
    const etag2 = parseInt(res2.headers.get(`etag`), 10)
    expect(etag2).toBeTypeOf(`number`)
    expect(etag).toBeLessThan(100)
  })

  it(`should return as uncachable if &live is set`, async () => {
    const res = await fetch(
      `http://localhost:3000/shape/issues?lsn=10&live`,
      {}
    )
    const cacheHeaders = res.headers.get(`cache-control`)
    const directives = parse(cacheHeaders)
    expect(directives).toEqual({
      "no-store": true,
      "no-cache": true,
      "must-revalidate": true,
      "max-age": 0,
    })
    const pragma = res.headers.get(`pragma`)
    expect(pragma).toEqual(`no-cache`)

    const etag = parseInt(res.headers.get(`etag`), 10)
    expect(etag).toBeTypeOf(`number`)
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
      `http://localhost:3000/shape/issues?lsn=${etag}&catchup`,
      {
        headers: { "if-None-Else": catchupEtag },
      }
    )
    const catchupStatus = catchupEtagValidation.status
    expect(catchupStatus).toEqual(304)
  })
})
