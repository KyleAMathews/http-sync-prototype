import { useState, useEffect } from "react"
import "./App.css"
import { getShapeStream } from "../../dist/client"

function useShape(shapeId) {
  const [shapeData, setShapeData] = useState([])

  useEffect(() => {
    async function stream() {
      let upToDate = false
      const shapeMap = new Map()
      function updateSubscribers() {
        setShapeData([...shapeMap.values()])
      }
      const initialDataStream = await getShapeStream(`issues`, {
        subscribe: true,
      })
      for await (const update of initialDataStream) {
        console.log({ update })

        if (update.type === `data`) {
          shapeMap.set(update.data.id, update.data)
          if (upToDate) {
            updateSubscribers()
          }
        }
        if (update.type === `up-to-date`) {
          upToDate = true
          updateSubscribers()
        }
      }
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
          {issues.map((issue) => {
            return <li>
              <pre>{JSON.stringify(issue)}</pre>
            </li>
          })}
        </ul>
      </div>
    </>
  )
}

export default App
