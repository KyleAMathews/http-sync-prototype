import express from "express"
import { Request, Response } from "express"
import bodyParser from "body-parser"
import cors from "cors"
import { open } from "lmdb" // or require
import deepEqual from "deep-equal"

const fs = require(`fs`)
const path = `./wal` // Replace with your directory path

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

const snapshot = new Map([
  [
    `issue-1`,
    {
      type: `data`,
      lsn: 0,
      data: { table: `issue`, id: 1, title: `foo` },
    },
  ],
])

const opsLog = [
  {
    type: `data`,
    lsn: 0,
    data: { table: `issue`, id: 1, title: `foo` },
  },
  {
    type: `data`,
    lsn: 1,
    data: { table: `issue`, id: 1, title: `foo1` },
  },
]

export const lastSnapshotLSN = 0

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

function compactSnapshot({ shapeId = `issues`, operations }) {
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

function updateDbAndDiff(mutation) {
  const oldDb = new Map(JSON.parse(JSON.stringify(Array.from(fakeDb))))
  mutation()
  const operations = diffMaps(oldDb, fakeDb)
  return operations
}

export function appendRow() {
  console.log(`appending row`)
  // get last row from ops log and then append new one
  // to ops log and write to open connections
  const lastLog = getLastLogForShape(`issues`)
  let lastLsn = lastLog.lsn
  lastLsn += 1
  const newId = lastLog.data.id + 1
  const newRow = { id: newId, title: `foo${lastLsn}` }

  const newOperations = updateDbAndDiff(() => {
    fakeDb.set(newId, newRow)
  })

  const opsWithLSN = newOperations.map((op) => {
    const opWithLsn = { ...op, lsn: lastLsn }
    lastLsn += 1
    return opWithLsn
  })

  openConnections.forEach((res) => {
    res.json([opsWithLSN])
  })
  openConnections.clear()

  opsWithLSN.forEach((op) => {
    lmdb.putSync(`issues-log-${op.lsn}`, op)
  })

  const shapeId = `issues`
  compactSnapshot({ shapeId, operations: opsWithLSN })
}

function getLastLogForShape(shapeId = `issues`) {
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

export function updateRow(id) {
  // // Update the DB & then opsLog w/ diff
  console.log(`updating row`, { id })
  let lastLsn = getLastLogForShape(`issues`).lsn
  lastLsn += 1
  const newOperations = updateDbAndDiff(() => {
    const row = fakeDb.get(id)
    row.title = `foo${lastLsn}`
    fakeDb.set(id, row)
  })
  const opsWithLSN = newOperations.map((op) => {
    const opWithLsn = { ...op, lsn: lastLsn }
    lastLsn += 1
    return opWithLsn
  })
  openConnections.forEach((res) => {
    res.json([opsWithLSN])
  })
  openConnections.clear()

  opsWithLSN.forEach((op) => {
    lmdb.putSync(`issues-log-${op.lsn}`, op)
  })

  const shapeId = `issues`
  compactSnapshot({ shapeId, operations: opsWithLSN })
}

export function createServer() {
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

  app.post(`/shape/issues/append-row/`, (req: Request, res: Response) => {
    appendRow()
    res.send(`ok`)
  })

  // Endpoint to get initial data and subscribe to updates
  app.get(`/shape/:id`, async (req: Request, res: Response) => {
    const lsn = parseInt(req.query.lsn, 10)
    const isCatchUp = `catchup` in req.query && req.query.catchup !== false
    console.log(`server /shape:id`, { lsn })

    // Set caching headers.
    res.set(`Cache-Control`, `max-age=60, stale-while-revalidate=300`)

    const reqId = Math.random()
    const shapeId = req.params.id

    const opsLogLength = getOpsLogLength(shapeId)

    console.log({ opsLogLength, isCatchUp, query: req.query })
    if (lsn === -1) {
      console.log(`return snapshot`)
      // Is there a snapshot already?
      const isSnapshot = lmdb.doesExist(`${shapeId}-has-snapshot`)
      const snapshot = []
      console.log({ isSnapshot })
      if (isSnapshot) {
        const etag = lastSnapshotLSN
        res.set(`etag`, etag)

        // Check If-None-Match header for ETag validation
        const ifNoneElse = req.headers[`if-none-else`]
        if (ifNoneElse === etag.toString()) {
          return res.status(304).end() // Not Modified
        }

        // Ok, retrieve snapshot and return.
        for (const { key, value } of lmdb.getRange({
          start: `${shapeId}-snapshot-`,
          end: `${shapeId}-snapshot-${MAX_VALUE}`,
        })) {
          snapshot.push(value)
        }
      } else {
        console.log(`generate snapshot`)
        // Generate a snapshot
        let lsn = 0
        fakeDb.forEach((row) => {
          const log = {
            type: `data`,
            lsn,
            data: { ...row },
          }
          snapshot.push(log)
          lmdb.putSync(`${shapeId}-snapshot-${row.id}`, log)
          lmdb.putSync(`${shapeId}-snapshotHighLsn`, lsn)
          lmdb.putSync(`${shapeId}-log-${lsn}`, log)
          lsn += 1
        })
        lmdb.putSync(`${shapeId}-has-snapshot`, true)
      }

      return res.json([...snapshot])
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

      return res.json([...slicedOperations, { type: `up-to-date` }])
    } else if (req.isBrowser) {
      console.log(`live updates`, { lsn })
      function close() {
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
      resolve(server)
    })
    server.on(`close`, () => {
      console.log(`Server closed.`)
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
