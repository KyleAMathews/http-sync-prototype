import express from "express"
import { Request, Response } from "express"
import bodyParser from "body-parser"
import cors from "cors"
import { open } from "lmdb" // or require
import deepEqual from "deep-equal"
import Database from "better-sqlite3"
import { electrify } from "electric-sql/node"
import jwt from "jsonwebtoken"
import { v4 as uuidv4 } from "uuid"
import pg from "pg"
const { Client } = pg

function unsignedJWT(userId, customClaims) {
  const claims = customClaims || {}

  return jwt.sign({ ...claims, sub: userId }, ``, { algorithm: `none` })
}

const fs = require(`fs`)
const path = `./wal` // Replace with your directory path

const client = new Client({
  host: `localhost`,
  port: 5532,
  password: `pg_password`,
  user: `postgres`,
  database: `testing-instance`,
})
client.connect()

const shapes = new Map()
const shapesSetupPromise = new Map()
async function getShape({ db, shapeId }) {
  if (shapes.has(shapeId) && !shapesSetupPromise.has(shapeId)) {
    return shapes.get(shapeId)
  } else if (shapesSetupPromise.has(shapeId)) {
    return shapesSetupPromise.get(shapeId)
  } else {
    let outsideResolve
    const setupPromise = new Promise((resolve) => {
      outsideResolve = resolve
    })
    shapesSetupPromise.set(shapeId, setupPromise)
    const shape = new Map()
    const snapshot = new Map()
    const data = new Map()
    shapes.set(shapeId, shape)
    let lsn = 1
    const shapeSync = await db[shapeId].sync()
    await shapeSync.synced
    const liveQuery = await db[shapeId].liveMany()

    // Add the initial start control message.
    lmdb.putSync(`${shapeId}-log-0`, { type: `control`, data: `start`, lsn: 0 })

    const res = await liveQuery()
    res.result.forEach((row) => {
      const log = {
        type: `data`,
        lsn,
        data: { ...row },
      }
      data.set(row.id, row)
      snapshot.set(row.id, log)
      lmdb.putSync(`${shapeId}-snapshot-${row.id}`, log)
      lmdb.putSync(`${shapeId}-snapshotHighLsn`, lsn)
      lmdb.putSync(`${shapeId}-log-${lsn}`, log)
      lsn += 1
    })
    lmdb.putSync(`${shapeId}-has-snapshot`, true)
    shape.set(`snapshot`, snapshot)
    shape.set(`data`, data)
    const unsubscribe = liveQuery.subscribe((resultUpdate) => {
      let lastLsn = getLastLogForShape(shapeId)?.lsn || 0
      lastLsn += 1

      const newData = new Map()
      resultUpdate.results.forEach((row) => newData.set(row.id, row))

      const operations = diffMaps(shape.get(`data`), newData)

      const opsWithLSN = operations.map((op) => {
        const opWithLsn = { ...op, lsn: lastLsn }
        lastSnapshotLSN = lastLsn
        lastLsn += 1
        return opWithLsn
      })
      openConnections.forEach((res) => {
        res.json(opsWithLSN)
      })
      openConnections.clear()

      opsWithLSN.forEach((op) => {
        lmdb.putSync(`${shapeId}-log-${op.lsn}`, op)
      })

      opsWithLSN.forEach((op) => {
        if (op.type === `data`) {
          // lmdb.put(`${shapeId}-snapshot-${op.data.id}`, op)
          snapshot.set(op.data.id, op)
        } else if (op.type === `gone`) {
          // lmdb.removeSync(`${shapeId}-snapshot-${op.data.id}`)
          snapshot.delete(op.data.id)
        }
      })
      shape.set(`snapshot`, snapshot)
      shape.set(`data`, newData)
    })

    shape.set(`unsubscribe`, unsubscribe)

    outsideResolve(shape)
    shapesSetupPromise.delete(shapeId)
    return shape
  }
}

// Function to delete directory and its contents synchronously
function deleteDirectorySync(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach((file) => {
      const curPath = `${dirPath}/${file}`
      if (fs.lstatSync(curPath).isDirectory()) {
        // Recursively delete subdirectory
        deleteDirectorySync(curPath)
      } else {
        // Delete file
        fs.unlinkSync(curPath)
      }
    })
    // Delete the now-empty directory
    fs.rmdirSync(dirPath)
  } else {
  }
}

// Delete the 'wal' directory
deleteDirectorySync(path)

const MAX_VALUE = `\uffff`
const lmdb = open({
  path: `wal`,
  compression: true,
})

export function deleteDb() {
  // for (const { key, value } of lmdb.getRange({
  // start: ``,
  // end: `${MAX_VALUE}`,
  // })) {
  // console.log({ value, key })
  // }
  lmdb.dropSync()
}

const fakeDb = new Map([[1, { id: 1, title: `foo` }]])

export let lastSnapshotLSN = 0

function getOpsLogLength(shapeId) {
  let opsLogLength = 0
  for (const key of lmdb.getKeys({
    start: `${shapeId}-log-`,
    end: `${shapeId}-log-${MAX_VALUE}`,
  })) {
    opsLogLength += 1
  }

  return opsLogLength
}

function getSnapshotInfo(shapeId) {
  let snapshotSize = 0
  for (const _key of lmdb.getKeys({
    start: `${shapeId}-snapshot-`,
    end: `${shapeId}-snapshot-${MAX_VALUE}`,
  })) {
    snapshotSize += 1
  }

  const latestSnapshotLSN = lmdb.get(`${shapeId}-snapshotHighLsn`)

  return { snapshotSize, latestSnapshotLSN }
}

function compactSnapshot({ shapeId, operations }) {
  operations.forEach((op) => {
    if (op.type === `data`) {
      lmdb.put(`${shapeId}-snapshot-${op.data.id}`, op)
    } else if (op.type === `gone`) {
      lmdb.removeSync(`${shapeId}-snapshot-${op.data.id}`)
    }
  })
}

const openConnections = new Map()
const lastId = 1

function diffMaps(map1, map2) {
  const operations = []

  // Iterate through each key in the first map
  for (const [key, value] of map1) {
    if (!map2.has(key)) {
      // If the key no longer exists in map2
      operations.push({
        type: `gone`,
        data: key,
      })
    } else if (!deepEqual(map2.get(key), value)) {
      // If the key exists but the value is different
      operations.push({
        type: `data`,
        data: map2.get(key),
      })
    }
  }

  // Iterate through each key in the second map to find new keys
  for (const [key, value] of map2) {
    if (!map1.has(key)) {
      // If the key is new in map2
      operations.push({
        type: `data`,
        data: value,
      })
    }
  }

  return operations
}

export async function appendRow({ title }) {
  console.log(`appending row`)
  const uuid = uuidv4()
  try {
    const result = await client.query(
      `insert into issues(id, title) values($1, $2)`,
      [uuid, title]
    )
  } catch (e) {
    console.log(e)
    throw e
  }

  return uuid
}

function getLastLogForShape(shapeId: string) {
  let lastLog
  for (const { key, value } of lmdb.getRange({
    start: `${shapeId}-log-${MAX_VALUE}`,
    end: `${shapeId}-log-`,
    limit: 1,
    reverse: true,
  })) {
    lastLog = value
  }

  return lastLog
}

export async function updateRow({ id, title }) {
  console.log(`updating row`, { id, title })
  try {
    await client.query(`update issues set title = $1 where id = $2`, [
      title,
      id,
    ])
  } catch (e) {
    console.log(e)
  }
}

export async function createServer({ schema, config }) {
  console.log(`inside createServer`)
  const runId = Math.random()
  const conn = new Database(`test-dbs/${runId}.db`)
  const electric = await electrify(conn, schema, config)
  const token = unsignedJWT(`1`)
  await electric.connect(token)
  const { db } = electric

  const app = express()

  // Enable CORS for all routes
  app.use(cors())

  app.use(bodyParser.json())
  // Middleware to check if request is from a browser
  const isBrowserRequest = (req, res, next) => {
    const userAgent = req.headers[`user-agent`]
    if (userAgent) {
      // more is it capable of long-polling and streaming changes...
      // probably this should an explicit opt-in thing by the client to long-poll?
      const isBrowser = /node|Mozilla|Chrome|Safari|Opera|Edge|Trident/.test(
        userAgent
      )
      if (isBrowser) {
        req.isBrowser = true
      } else {
        req.isBrowser = false
      }
    } else {
      console.log(`No User-Agent header found.`)
      req.isBrowser = false
    }
    next()
  }

  // Use the middleware
  app.use(isBrowserRequest)

  const port = 3000

  app.post(`/shape/issues/update-row/:id`, (req: Request, res: Response) => {
    const rowId = parseInt(req.params.id, 10)
    updateRow(rowId)
    res.send(`ok`)
  })

  app.post(`/shape/issues/append-row/`, async (req: Request, res: Response) => {
    await appendRow({ title: Math.random() })
    res.send(`ok`)
  })

  // Endpoint to get initial data and subscribe to updates
  app.get(`/shape/:id`, async (req: Request, res: Response) => {
    const lsn = parseInt(req.query.lsn, 10)
    const isCatchUp = `catchup` in req.query && req.query.catchup !== false

    // Set caching headers.
    res.set(`Cache-Control`, `max-age=60, stale-while-revalidate=300`)

    const reqId = Math.random()
    const shapeId = req.params.id
    const shape = await getShape({ db, shapeId })

    const opsLogLength = getOpsLogLength(shapeId)

    console.log(`server /shape:id`, {
      lsn,
      opsLogLength,
      isCatchUp,
      query: req.query,
    })

    if (lsn === -1) {
      const etag = lastSnapshotLSN
      res.set(`etag`, etag)

      // Check If-None-Match header for ETag validation
      const ifNoneElse = req.headers[`if-none-else`]
      if (ifNoneElse === etag.toString()) {
        return res.status(304).end() // Not Modified
      }
      const snapshot = [
        { type: `control`, data: `start`, lsn: 0 },
        ...shape.get(`snapshot`).values(),
      ]

      return res.json(snapshot)
    } else if (isCatchUp || lsn + 1 < opsLogLength) {
      console.log(`catch-up`, { lsn, opsLogLength })
      const slicedOperations = []
      const etag = getLastLogForShape(shapeId).lsn
      for (const { value } of lmdb.getRange({
        start: `${shapeId}-log-`,
        end: `${shapeId}-log-${MAX_VALUE}`,
        offset: lsn + 1,
      })) {
        slicedOperations.push(value)
      }
      res.set(`etag`, etag)

      // Check If-None-Match header for ETag validation
      const ifNoneElse = req.headers[`if-none-else`]
      if (ifNoneElse === etag.toString()) {
        return res.status(304).end() // Not Modified
      }

      return res.json([
        ...slicedOperations,
        { type: `control`, data: `up-to-date` },
      ])
    } else if (req.isBrowser) {
      console.log(`live updates`, { lsn })
      function close() {
        console.log(`closing live poll`)
        openConnections.delete(reqId)
        res.status(204).send(`no updates`)
      }

      openConnections.set(reqId, res)

      const timeoutId = setTimeout(() => close, 30000) // Timeout after 30 seconds

      req.on(`close`, () => clearTimeout(timeoutId))
    } else {
      res.status(204).send(`no updates`)
    }
  })

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`)
      resolve({ express: server, electric })
    })
    server.on(`close`, (e) => {
      console.log(`Server closed.`, e)
    })

    server.on(`error`, (err) => {
      console.error(`Server encountered an error:`, err)
    })

    process.on(`uncaughtException`, (err) => {
      console.error(`Uncaught exception:`, err)
      // Gracefully shut down the server
      server.close(() => {
        process.exit(1) // Exit with a non-zero status
      })
    })

    process.on(`SIGTERM`, () => {
      console.log(`Received SIGTERM, shutting down gracefully.`)
      server.close(() => {
        process.exit(0) // Exit with a zero status
      })
    })
  })
}
