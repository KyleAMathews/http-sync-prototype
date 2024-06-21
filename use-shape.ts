import { useState, useEffect } from "react"
import { ShapeStream } from "./dist/client"

export function useShape(config) {
  const [shapeData, setShapeData] = useState([])

  useEffect(() => {
    async function stream() {
      let upToDate = false
      const shapeMap = new Map()
      function updateSubscribers() {
        setShapeData([...shapeMap.values()])
      }
      console.log(`new ShapeStream`)
      const issueStream = new ShapeStream(config)
      console.log({ issueStream })
      issueStream.subscribe((update) => {
        console.log({ update })

        // Upsert data message
        if (update.type === `data`) {
          shapeMap.set(update.data.id, update.data)
        }

        // Delete data message
        if (update.type === `gone`) {
          shapeMap.delete(update.data)
        }

        // Control message telling client they're up-to-date
        if (update.type === `control` && update.data === `up-to-date`) {
          upToDate = true
        }

        // The end of each JSON batch of ops has a `batch-done` control message
        // so wait for that (and that we're up-to-date) before notifying subscribers.
        console.log({ upToDate, type: update.type, data: update.data })
        if (
          upToDate &&
          update.type === `control` &&
          update.data === `batch-done`
        ) {
          updateSubscribers()
        }
      })
    }
    stream()
  }, [])

  return shapeData
}
