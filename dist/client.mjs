// client.ts
async function getShapeStream(shapeId, options) {
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let lastLSN = options.lsn || -1
        let upToDate = false
        while (!upToDate || options.subscribe) {
          console.log({ lastLSN, upToDate, options: options.subscribe })
          await fetch(`http://localhost:3000/shape/issues?lsn=${lastLSN}`, {
            signal: options.signal,
          })
            .then((response) => response.json())
            .then((data) => {
              let foundLsn = false
              for (let i = data.length - 1; i >= 0 && !foundLsn; i--) {
                if (data[i].type === `data`) {
                  lastLSN = data[i].lsn
                  foundLsn = true
                }
                if (data[i].type === `up-to-date`) {
                  upToDate = true
                }
              }
              data.forEach((update) => controller.enqueue(update))
            })
        }
        console.log(`client is closed`)
        controller.close()
      } catch (error) {}
    },
  })
  return stream
}
export { getShapeStream }

