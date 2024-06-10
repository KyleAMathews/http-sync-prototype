const baseUrl = `http://localhost:3000`

export class ShapeStream {
  private subscribers: ((updates: any[]) => void)[] = []

  constructor(options = { subscribe: true }) {
    this.options = options
    console.log(`constructor`, this.options)
    this.startStream()
  }

  private async startStream() {
    try {
      let lastLSN = this.options.lsn || -1
      let upToDate = false

      // fetch loop.
      while (!upToDate || this.options.subscribe) {
        console.log({ lastLSN, upToDate, options: this.options.subscribe })
        await fetch(`http://localhost:3000/shape/issues?lsn=${lastLSN}`, {
          signal: this.options.signal,
        })
          .then((response) => response.json())
          .then((data) => {
            let foundLsn = false

            data.forEach((update) => {
              if (update.type === `data`) {
                lastLSN = update.lsn
                foundLsn = true
              }
              if (update.type === `up-to-date`) {
                upToDate = true
              }
              this.publish(update)
            })
          })
      }

      console.log(`client is closed`)
    } catch (error) {
      console.error(`error`, error)
    }
  }

  subscribe(callback: (updates: any[]) => void) {
    this.subscribers.push(callback)
  }

  publish(updates: any) {
    for (const subscriber of this.subscribers) {
      subscriber(updates)
    }
  }
}
