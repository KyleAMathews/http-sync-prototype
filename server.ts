import express from "express"
import { Request, Response } from "express"
import bodyParser from "body-parser"
import cors from "cors"

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

export let lastSnapshotLSN = 0

function compactSnapshot() {
  if (snapshot.size * 1.3 < opsLog.length - lastSnapshotLSN) {
    opsLog.slice(lastSnapshotLSN).forEach((op) => {
      snapshot.set(`${op.data.table}-${op.data.id}`, op)
    })
    lastSnapshotLSN = opsLog.slice(-1)[0].lsn
  }
}

const openConnections = new Map()
let lastId = 1

export function appendRow() {
  // get last row from ops log and then append new one
  // to ops log and write to open connections
  const lastLsn = opsLog.slice(-1)[0].lsn
  lastId = lastId + 1
  const newOp = {
    type: `data`,
    lsn: lastLsn + 1,
    data: { table: `issue`, id: lastId, title: `foo${lastLsn + 1}` },
  }

  openConnections.forEach((res) => {
    res.json([newOp])
  })
  openConnections.clear()

  compactSnapshot()

  opsLog.push(newOp)
}

export function updateRow(id) {
  // get last value from ops log and then update it and append new value
  // to ops log and write to open connections.
  const lastLsn = opsLog.slice(-1)[0].lsn
  let lastOp
  for (let i = opsLog.length - 1; i >= 0; i--) {
    const op = opsLog[i]
    if (op.data && op.data.id === id) {
      lastOp = op
      break
    }
  }

  const newOp = JSON.parse(JSON.stringify(lastOp))
  const newLsn = lastLsn + 1
  newOp.data.title = `foo${newLsn}`
  newOp.lsn = newLsn
  opsLog.push(newOp)
  openConnections.forEach((res) => {
    res.json([newOp])
  })
  openConnections.clear()

  compactSnapshot()
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
    const reqId = Math.random()
    const shapeId = req.params.id

    const lsn = parseInt(req.query.lsn, 10)
    console.log(`server /shape:id`, { lsn })

    // Send initial cached response
    if (shapeId === `issues`) {
      if (lsn === -1) {
        console.log(`return snapshot`)
        return res.json([...snapshot.values()])
      } else if (lsn + 1 < opsLog.length) {
        console.log(`catch-up updates`, { lsn })
        return res.json([...opsLog.slice(lsn + 1), { type: `up-to-date` }])
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
    } else {
      res.status(404).send(`Shape not found`)
    }
  })

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`)
      resolve(server)
    })
  })
}
