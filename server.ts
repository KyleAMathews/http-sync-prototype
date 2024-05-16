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

export function createServer() {
  const app = express()
  app.use(bodyParser.json())

  const port = 3000

  // Endpoint to get initial data and subscribe to updates
  app.get(`/shape/:id`, async (req: Request, res: Response) => {
    const shapeId = req.params.id
    console.log(req.query)

    // Send initial cached response
    if (shapeId === `issues`) {
      if (!req.query.lsn) {
        const { resultStreamer, streamPipeline } = streamData(res)
        resultStreamer.write({
          type: `data`,
          lsn: 1,
          data: { table: `issue`, id: 1, title: `foo` },
        })
        resultStreamer.end()
        await streamPipeline
      } else if (req.query.lsn === `1`) {
        const { resultStreamer, streamPipeline } = streamData(res)
        resultStreamer.write({
          type: `data`,
          lsn: 2,
          data: { table: `issue`, id: 1, title: `foo2` },
        })
        resultStreamer.write({
          type: `up-to-date`,
        })
        resultStreamer.end()
        await streamPipeline
      } else {
        const lsn = parseInt(req.query.lsn, 10)
        console.log(`live updates`, { lsn })
        const { resultStreamer, streamPipeline } = streamData(res)
        const timeoutId = setTimeout(() => {
          resultStreamer.end()
        }, 30000) // Timeout after 30 seconds

        req.on(`close`, () => {
          clearTimeout(timeoutId)
        })

        // Simulation of a data update condition
        // This should be replaced by your actual data update logic
        console.log(`foo`)
        console.log({
          type: `data`,
          lsn: lsn + 1,
          data: { table: `issue`, id: 1, title: `foo${lsn + 1}` },
        })
        resultStreamer.write({
          type: `data`,
          lsn: lsn + 1,
          data: { table: `issue`, id: 1, title: `foo${lsn + 1}` },
        })
        resultStreamer.end()
        await streamPipeline
        clearTimeout(timeoutId)
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
