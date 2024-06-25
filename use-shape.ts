import { useState, useEffect } from "react"
import { ShapeStream } from "./dist/client"
import { Message } from "./types"

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
      issueStream.subscribe((message: Message) => {
        console.log({ message })
        console.log(
          `message`,
          message,
          message.headers?.[`action`],
          [`insert`, `update`].includes(message.headers?.[`action`])
        )

        // Upsert/delete new data
        if (message.headers?.[`action`] === `delete`) {
          shapeMap.delete(message.key)
        } else if ([`insert`, `update`].includes(message.headers?.[`action`])) {
          shapeMap.set(message.key, message.value)
        }

        // Control message telling client they're up-to-date
        if (message.headers?.[`control`] === `up-to-date`) {
          upToDate = true
        }

        // The end of each JSON batch of ops has a `batch-done` control message
        // so wait for that (and that we're up-to-date) before notifying subscribers.
        if (message.headers?.[`control`] === `batch-done`) {
          // TODO only update if there's been a change.
          updateSubscribers()
        }
      })
    }
    stream()
  }, [])

  return shapeData
}
