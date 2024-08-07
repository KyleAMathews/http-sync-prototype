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
import { Message } from "./types"
import crypto from "crypto"

function hashString(inputString, algorithm = `sha256`) {
  return crypto.createHash(algorithm).update(inputString).digest(`hex`)
}

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

export function deleteShape(shapeId) {
  shapes.delete(shapeId)
}

function padNumber(num) {
  return num.toString().padStart(10, `0`)
}

async function setupSyncing(db) {
  let lsn = 0
  const promises = []
  Object.entries(db).forEach(([key, value]) => {
    if (`sync` in value) {
      promises.push(value.sync())
    }
  })

  const results = await Promise.all(promises)
  await Promise.all(results.map((result) => result.synced))

  // Start listening for updates.
  Object.entries(db).forEach(async ([key, value]) => {
    if (`sync` in value) {
      promises.push(value.sync())
      const liveQuery = await value.liveMany()
      let data = new Map()
      const res = await liveQuery()
      res.result.forEach((row) => {
        data.set(row.id, row)
      })

      liveQuery.subscribe(async (resultUpdate) => {
        if (resultUpdate.results && resultUpdate.results.length > 0) {
          const newData = new Map()
          resultUpdate.results.forEach((row) => newData.set(row.id, row))

          const messages = diffMaps(data, newData)
          messages.forEach(async (message) => {
            lmdb.putSync(`replication-log-${padNumber(lsn)}`, message)
            lsn += 1
          })

          // Get shape (there's only one per table right now).
          const shape = await getShape({ db, shapeTable: key })
          shape.get(`appendToShapeLog`)({ messages })
          data = newData
        }
      })
    }
  })
}
async function getShape({ db, shapeTable = `` }) {
  if (shapes.has(shapeTable) && !shapesSetupPromise.has(shapeTable)) {
    return shapes.get(shapeTable)
  } else if (shapesSetupPromise.has(shapeTable)) {
    return shapesSetupPromise.get(shapeTable)
  } else {
    let outsideResolve
    const setupPromise = new Promise((resolve) => {
      outsideResolve = resolve
    })
    shapesSetupPromise.set(shapeTable, setupPromise)
    const shape = new Map()
    shape.set(`created_at`, new Date().toJSON())
    const id = hashString(`${shape.get(`created_at`)}-${shapeTable}`, `md5`)
    shape.set(`id`, id)
    const data = new Map()
    shapes.set(shapeTable, shape)
    if (!db[shapeTable]) {
      throw new Error(`shapeTable not found on db — ${shapeTable}`)
    }
    const res = await db[shapeTable].findMany()

    let offset = 0
    // Add the initial start control message.
    lmdb.putSync(`${shapeTable}-log-${padNumber(offset)}`, {
      headers: {
        control: `start`,
      },
      offset,
    })

    res.forEach((row) => {
      offset += 1
      const log = {
        key: row.id,
        offset,
        value: { ...row },
        headers: { action: `insert` },
      }
      data.set(row.id, row)
      if (log.offset) {
        lmdb.putSync(`${shapeTable}-log-${padNumber(offset)}`, log)
      }
    })

    shape.set(`lastOffset`, offset)
    shape.set(`data`, data)
    shape.set(`openConnections`, new Map())
    shape.set(`appendToShapeLog`, ({ messages }) => {
      console.log(`appendToShapeLog`, messages)
      let offset = shape.get(`lastOffset`)
      const messagesWithOffset = messages.map((message) => {
        offset += 1
        const messageWithOffset = { ...message, offset }
        lmdb.putSync(
          `${shapeTable}-log-${padNumber(offset)}`,
          messageWithOffset
        )
        return messageWithOffset
      })
      const openConnections = shape.get(`openConnections`)

      messagesWithOffset.push({ headers: { control: `up-to-date` } })

      openConnections.forEach((res) => {
        res.json(messagesWithOffset)
      })

      openConnections.clear()
      shape.set(`openConnections`, openConnections)

      shape.set(`lastOffset`, offset)
    })

    outsideResolve(shape)
    shapesSetupPromise.delete(shapeTable)
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
  lmdb.dropSync()
}

function diffMaps(map1, map2) {
  const messages = []

  // Iterate through each key in the first map
  for (const [key, value] of map1) {
    if (!map2.has(key)) {
      // If the key no longer exists in map2
      messages.push({
        key: key,
        headers: { action: `delete` },
      })
    } else if (!deepEqual(map2.get(key), value)) {
      // If the key exists but the value is different
      messages.push({
        key,
        value: map2.get(key),
        headers: { action: `update` },
      })
    }
  }

  // Iterate through each key in the second map to find new keys
  for (const [key, value] of map2) {
    if (!map1.has(key)) {
      // If the key is new in map2
      messages.push({
        key,
        value,
        headers: { action: `insert` },
      })
    }
  }

  return messages
}

let networkDown = false
export function toggleNetworkConnectivity() {
  networkDown = !networkDown
}

export async function createServer({
  schema,
  config,
  addRoutes = (app) => {},
}) {
  console.log(`inside createServer`)
  const runId = Math.random()
  const conn = new Database(`test-dbs/${runId}.db`)
  const electric = await electrify(conn, schema, config)
  const token = unsignedJWT(`1`)
  await electric.connect(token)
  const { db } = electric

  await setupSyncing(db)

  const app = express()

  // Enable CORS for all routes
  app.use(cors())

  app.use(express.json())

  app.use((_req, res, next) => {
    console.log({ networkDown })
    if (networkDown) {
      return res.status(500).end()
    }

    // If you want to continue processing the request
    next()
  })

  const port = 3000

  // Allow server to add their own routes
  addRoutes(app)

  // Endpoint to get initial data and subscribe to updates
  app.get(`/shape/:table`, async (req: Request, res: Response) => {
    let offset = parseInt(req.query.offset, 10)
    if (!Number.isFinite(offset)) {
      offset = -1
    }
    const isLive = `live` in req.query && req.query.live !== false
    const isCatchUp = `notLive` in req.query && req.query.notLive !== false
    const shapeIdHeader = req.query.shapeId

    const reqId = Math.random()
    const shapeTable = req.params.table
    const shape = await getShape({ db, shapeTable })

    const lastOffset = shape.get(`lastOffset`)
    const shapeId = shape.get(`id`)

    console.log(`server /shape:id`, {
      offset,
      isLive,
      lastOffset,
      isCatchUp,
      query: req.query,
    })

    // Validation
    if (!shape) {
      return res.status(404).json({ error: `Shape not found` })
    }

    if (offset !== -1 && shapeId !== shapeIdHeader) {
      return res.json([{ headers: { control: `must-refetch` } }])
    }

    // Set shape header.
    res.set(`x-electric-shape-id`, shape.get(`id`))

    // Set caching headers.
    if (isLive) {
      res.set(`Cache-Control`, `no-store, no-cache, must-revalidate, max-age=0`)
      res.set(`Pragma`, `no-cache`)
      res.set(`Expires`, `0`)
    } else {
      res.set(`Cache-Control`, `max-age=60, stale-while-revalidate=300`)
    }

    if (offset === -1) {
      console.log(`GET initial snapshot`)
      const etag = shape.get(`lastOffset`)
      res.set(`etag`, etag)

      // Check If-None-Match header for ETag validation
      const ifNoneMatch = req.headers[`if-none-match`]
      if (ifNoneMatch === etag.toString()) {
        return res.status(304).end() // Not Modified
      }

      // Streaming this would be more memory efficient.
      const snapshot = []

      for (const { value } of lmdb.getRange({
        start: `${shapeTable}-log-`,
        end: `${shapeTable}-log-${MAX_VALUE}`,
      })) {
        snapshot.push(value)
      }

      return res.json(snapshot)
    } else if (isCatchUp || offset < lastOffset) {
      console.log(`GET catch-up`, { offset, lastOffset })
      const slicedMessages = new Map()
      const etag = shape.get(`lastOffset`)
      for (const { value } of lmdb.getRange({
        start: `${shapeTable}-log-`,
        end: `${shapeTable}-log-${MAX_VALUE}`,
        offset: offset + 1,
      })) {
        slicedMessages.set(value.key, value)
      }
      res.set(`etag`, etag)

      // Check If-None-Match header for ETag validation
      const ifNoneMatch = req.headers[`if-none-match`]
      if (ifNoneMatch === etag.toString()) {
        return res.status(304).end() // Not Modified
      }

      return res.json([
        ...slicedMessages.values(),
        { headers: { control: `up-to-date` } },
      ])
    } else if (isLive) {
      console.log(`GET live updates`, { offset })
      function close() {
        console.log(`closing live poll`)
        shape.get(`openConnections`).delete(reqId)
        res.status(204).end()
      }

      shape.get(`openConnections`).set(reqId, res)

      const timeoutId = setTimeout(() => close, 30000) // Timeout after 30 seconds

      req.on(`close`, () => clearTimeout(timeoutId))
    } else {
      res.status(204).end()
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
