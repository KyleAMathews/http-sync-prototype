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
        console.log(`message`, message)

        // Upsert/delete new data
        if (message.headers?.some(({ key }) => key === `action`)) {
          if (message.headers?.some(({ value }) => value === `delete`)) {
            shapeMap.delete(message.key)
          } else {
            shapeMap.set(message.key, message.value)
          }
        }

        // Control message telling client they're up-to-date
        if (
          message.headers?.some(
            ({ key, value }) => key === `control` && value === `up-to-date`
          )
        ) {
          upToDate = true
        }

        // The end of each JSON batch of ops has a `batch-done` control message
        // so wait for that (and that we're up-to-date) before notifying subscribers.
        if (
          upToDate &&
          message.headers?.some(
            ({ key, value }) => key === `control` && value === `batch-done`
          )
        ) {
          // TODO only update if there's been a change.
          updateSubscribers()
        }
      })
    }
    stream()
  }, [])

  return shapeData
}
