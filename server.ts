import express from "express"
import { Request, Response } from "express"
import bodyParser from "body-parser"
import { pipeline } from "node:stream/promises"
import Stringer from "stream-json/jsonl/Stringer"

function streamData(res) {
  res.writeHead(200, {
    "Content-Type": `text/plain`,
    "Transfer-Encoding": `chunked`,
    Connection: `keep-alive`,
    "Access-Control-Allow-Origin": `*`,
  })
  const resultStreamer = new Stringer()
  const streamPipeline = pipeline(resultStreamer, res).catch((err) => {
    console.log(err)
  })

  return { resultStreamer, streamPipeline }
}

const snapshot = new Map([
  [
    `table-1`,
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

const openConnections = new Map()

export function appendRow() {
  // get last row from ops log and then append new one
  // to ops log and write to open connections
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
  console.log(`writing new op to connections`, { newOp })
  openConnections.forEach((resultStreamer) => {
    resultStreamer.write(newOp)
    resultStreamer.write({ type: `heartbeat` })
  })
}

export function createServer() {
  const app = express()
  app.use(bodyParser.json())

  const port = 3000

  // Endpoint to get initial data and subscribe to updates
  app.get(`/shape/:id`, async (req: Request, res: Response) => {
    const reqId = Math.random()
    const shapeId = req.params.id

    // Send initial cached response
    if (shapeId === `issues`) {
      if (!req.query.lsn) {
        console.log(`snapshot`)
        const { resultStreamer, streamPipeline } = streamData(res)
        for (const row of snapshot.values()) {
          resultStreamer.write(row)
        }
        resultStreamer.end()
        await streamPipeline
      } else {
        const lsn = parseInt(req.query.lsn, 10)
        if (lsn + 1 < opsLog.length) {
          console.log(`catch-up updates`, { lsn })
          const { resultStreamer, streamPipeline } = streamData(res)
          // Catch up the user
          for (const row of opsLog.slice(lsn + 1)) {
            resultStreamer.write(row)
          }
          resultStreamer.write({
            type: `up-to-date`,
          })
          resultStreamer.end()
          await streamPipeline
        } else {
          console.log(`live updates`, { lsn })
          async function close() {
            clearTimeout(timeoutId)
            openConnections.delete(reqId)
            resultStreamer.end()
            await streamPipeline
          }

          const { resultStreamer, streamPipeline } = streamData(res)
          openConnections.set(reqId, resultStreamer)

          const timeoutId = setTimeout(() => {
            close()
          }, 30000) // Timeout after 30 seconds

          req.on(`close`, () => {
            close()
          })
        }
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
