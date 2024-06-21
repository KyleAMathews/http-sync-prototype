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

        if (update.type === `data`) {
          shapeMap.set(update.data.id, update.data)
          if (upToDate) {
            updateSubscribers()
          }
        }
        if (update.type === `gone`) {
          shapeMap.delete(update.data)
          updateSubscribers()
        }
        if (update.type === `control` && update.data === `up-to-date`) {
          upToDate = true
          updateSubscribers()
        }
      })
    }
    stream()
  }, [])

  return shapeData
}
