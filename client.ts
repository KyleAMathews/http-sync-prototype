const baseUrl = `http://localhost:3000`
import { JSONLinesParseStream } from "./mod"

export async function getShapeStream(shapeId: string, options) {
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let lastLSN = 0
        let upToDate = false

        // Initial fetch.
        let initialUrl = `http://localhost:3000/shape/issues`
        if (options.lsn) {
          initialUrl += `?lsn=${options.lsn}`
        }
        await fetch(initialUrl, {
          signal: options.signal,
        }).then(async ({ body }) => {
          const readable = body!
            .pipeThrough(new TextDecoderStream())
            .pipeThrough(new JSONLinesParseStream())

          for await (const update of readable) {
            controller.enqueue(update)
            if (update.type === `data`) {
              lastLSN = update.lsn
            }
          }
        })

        console.log(`done with initial fetch`)

        // Continue to fetch.
        while (options.subscribe || !upToDate) {
          console.log({ lastLSN, upToDate, options: options.subscribe })
          await fetch(`http://localhost:3000/shape/issues?lsn=${lastLSN}`, {
            signal: options.signal,
          }).then(async ({ body }) => {
            const readable = body!
              .pipeThrough(new TextDecoderStream())
              .pipeThrough(new JSONLinesParseStream())

            for await (const update of readable) {
              controller.enqueue(update)
              if (update.type === `data`) {
                lastLSN = update.lsn
              }
              if (update.type === `up-to-date`) {
                upToDate = true
              }
            }
          })
        }

        controller.close()
      } catch (error) {
        // console.error(`error`, error)
      }
    },
  })

  return stream
}
