import { useState, useEffect } from "react"
import "./App.css"
import { ShapeStream } from "../../dist/client"

function useShape(shapeId) {
  const [shapeData, setShapeData] = useState([])

  useEffect(() => {
    async function stream() {
      let upToDate = false
      const shapeMap = new Map()
      function updateSubscribers() {
        setShapeData([...shapeMap.values()])
      }
      console.log(`new ShapeStream`)
      const issueStream = new ShapeStream({
        shape: {table: `issues`},
        subscribe: true,
      })
      console.log({issueStream})
      issueStream.subscribe(update => {
        console.log({ update })

        if (update.type === `data`) {
          shapeMap.set(update.data.id, update.data)
          if (upToDate) {
            updateSubscribers()
          }
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

function App() {
  const issues = useShape(`issues`)
  console.log({ issues })

  return (
    <>
      <div>
        <h1>useShape</h1>
        <ul>
          {issues.map((issue, i) => {
            return (
              <li key={i}>
                <pre>{JSON.stringify(issue)}</pre>
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}

export default App
