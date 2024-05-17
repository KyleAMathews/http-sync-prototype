import { beforeAll, afterAll, describe, it, expect } from "vitest"
import { getShapeStream } from "./client"
import { createServer, updateRow, lastSnapshotLSN } from "./server"

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
  it(`should get initial data and then receive updates`, async () => {
    const shapeData = new Map()
    const aborter = new AbortController()
    const dataStream = await getShapeStream(`issues`, {
      subscribe: true,
      signal: aborter.signal,
    })
    for await (const update of dataStream) {
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
  it(`Multiple clients can get the same data`, async () => {
    const shapeData1 = new Map()
    const aborter1 = new AbortController()
    const dataStream1 = await getShapeStream(`issues`, {
      subscribe: true,
      signal: aborter1.signal,
    })

    const shapeData2 = new Map()
    const aborter2 = new AbortController()
    const dataStream2 = await getShapeStream(`issues`, {
      subscribe: true,
      signal: aborter2.signal,
    })

    const promise1 = new Promise(async (resolve) => {
      for await (const update of dataStream1) {
        if (update.type === `data`) {
          shapeData1.set(update.data.id, update.data)
        }
        if (update.lsn === 1 || update.lsn === 2) {
          setTimeout(() => updateRow(1), 50)
        }

        if (update.lsn === 3) {
          aborter1.abort()
          expect(shapeData1).toEqual(
            new Map([[1, { table: `issue`, id: 1, title: `foo3` }]])
          )
          break
        }
      }
      resolve()
    })

    const promise2 = new Promise(async (resolve) => {
      for await (const update of dataStream2) {
        if (update.type === `data`) {
          shapeData2.set(update.data.id, update.data)
        }

        if (update.lsn === 3) {
          aborter2.abort()
          expect(shapeData2).toEqual(
            new Map([[1, { table: `issue`, id: 1, title: `foo3` }]])
          )
          break
        }
      }
      resolve()
    })

    await Promise.all([promise1, promise2])
  })
  it(`can go offline and then catchup`, async () => {
    const shapeData = new Map()
    const aborter = new AbortController()
    let lastLsn = 0
    const dataStream = await getShapeStream(`issues`, {
      subscribe: true,
      signal: aborter.signal,
    })
    for await (const update of dataStream) {
      if (update.lsn) {
        lastLsn = update.lsn
      }
      if (update.type === `data`) {
        shapeData.set(update.data.id, update.data)
      }
      if (update.lsn === 1 || update.lsn === 2) {
        setTimeout(() => updateRow(1), 10)
      }

      if (update.lsn === 3) {
        aborter.abort()
        break
      }
    }

    updateRow(1)
    updateRow(1)
    updateRow(1)
    updateRow(1)
    updateRow(1)

    let catchupOpsCount = 0
    const newAborter = new AbortController()
    const newDataStream = await getShapeStream(`issues`, {
      subscribe: true,
      signal: newAborter.signal,
      lsn: lastLsn,
    })
    for await (const update of newDataStream) {
      if (update.type === `data`) {
        catchupOpsCount += 1
      }
      if (update.type === `up-to-date`) {
        newAborter.abort()
        break
      }
    }

    expect(catchupOpsCount).toBe(5)
  })
  it(`the server compacts the initial snapshot when enough new ops have been added`, async () => {
    const currentLastLSN = lastSnapshotLSN
    updateRow(1)
    updateRow(1)
    updateRow(1)
    updateRow(1)
    updateRow(1)
    let firstLsn = 0
    const dataStream = await getShapeStream(`issues`, {})
    for await (const update of dataStream) {
      firstLsn = update.lsn
      break
    }
    expect(firstLsn - currentLastLSN).toBe(5)
  })
})
