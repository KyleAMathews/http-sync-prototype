import { beforeAll, afterAll, describe, it, expect } from "vitest"
import { getShapeStream } from "./client"
import { createServer, updateRow } from "./server"

beforeAll(async (context) => {
  context.server = await createServer()
})

afterAll((context) => {
  context.server.close()
})

describe(`HTTP Sync`, () => {
  it(`should get initial data`, async () => {
    // Get initial data
    const shapeData = new Map()
    const initialDataStream = await getShapeStream(`issues`, {
      subscribe: false,
    })
    for await (const update of initialDataStream) {
      if (update.type === `data`) {
        shapeData.set(update.data.id, update.data)
      }
      if (update.type === `up-to-date`) {
        // initialDataStream.close()
      }
    }

    expect(shapeData).toEqual(
      new Map([[1, { table: `issue`, id: 1, title: `foo1` }]])
    )
  })
  it.only(`should get initial data and then receive updates`, async () => {
    const shapeData = new Map()
    const aborter = new AbortController()
    const dataStream = await getShapeStream(`issues`, {
      subscribe: true,
      signal: aborter.signal,
    })
    for await (const update of dataStream) {
      console.log({ update })
      if (update.type === `data`) {
        shapeData.set(update.data.id, update.data)
      }
      if (update.lsn === 1 || update.lsn === 2) {
        setTimeout(() => updateRow(1), 10)
      }

      if (update.lsn === 3) {
        aborter.abort()
        expect(shapeData).toEqual(
          new Map([[1, { table: `issue`, id: 1, title: `foo3` }]])
        )
        break
      }
    }
  })
})
