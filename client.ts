import { Message } from "./types"

interface ShapeStreamOptions {
  shape: { table: string }
  baseUrl: string
  subscribe?: boolean
  signal?: AbortSignal
  offset?: number
}

export class ShapeStream {
  private subscribers: ((message: Message) => void)[] = []
  private batchSubscribers: ((messages: Message[]) => void)[] = []
  private instanceId: number
  private closedPromise: Promise<unknown>
  private outsideResolve?: (value?: unknown) => void
  options: ShapeStreamOptions

  constructor(options: ShapeStreamOptions) {
    this.validateOptions(options)
    this.instanceId = Math.random()
    this.options = { subscribe: true, ...options }
    console.log(`constructor`, this)
    this.startStream()

    this.outsideResolve
    this.closedPromise = new Promise((resolve) => {
      this.outsideResolve = resolve
    })
  }

  private validateOptions(options: ShapeStreamOptions): void {
    if (
      !options.shape ||
      !options.shape.table ||
      typeof options.shape.table !== `string`
    ) {
      throw new Error(
        `Invalid shape option. It must be an object with a "table" property that is a string.`
      )
    }
    if (!options.baseUrl) {
      throw new Error(`Invalid shape option. It must provide the baseUrl`)
    }
    if (options.signal && !(options.signal instanceof AbortSignal)) {
      throw new Error(
        `Invalid signal option. It must be an instance of AbortSignal.`
      )
    }
    // Add more validation rules as needed
  }

  private async startStream() {
    let lastOffset = this.options.offset || -1
    let upToDate = false
    let pollCount = 0

    // Variables for exponential backoff
    let attempt = 0
    const maxDelay = 10000 // 10 seconds in milliseconds
    const initialDelay = 100 // 100 milliseconds
    let delay = initialDelay

    // fetch loop.
    while (
      !this.options.signal?.aborted &&
      (!upToDate || this.options.subscribe)
    ) {
      pollCount += 1
      const url = new URL(
        `${this.options.baseUrl}/shape/${this.options.shape.table}`
      )
      url.searchParams.set(`offset`, lastOffset.toString())
      if (upToDate) {
        url.searchParams.set(`live`, ``)
      } else {
        url.searchParams.set(`notLive`, ``)
      }
      console.log({
        lastOffset,
        upToDate,
        pollCount,
        url: url.toString(),
      })
      try {
        await fetch(url.toString(), {
          signal: this.options.signal ? this.options.signal : undefined,
        })
          .then(async (response) => {
            if (!response.ok) {
              throw new Error(`HTTP error! Status: ${response.status}`)
            }
            attempt = 0
            if (response.status === 204) {
              return []
            }

            return response.json()
          })
          .then((data: Message[]) => {
            this.publishBatch(data)
            data.forEach((message) => {
              if (typeof message.offset !== `undefined`) {
                lastOffset = Math.max(lastOffset, message.offset)
              }
              if (message.headers?.[`control`] === `up-to-date`) {
                upToDate = true
              }
              if (!this.options.signal?.aborted) {
                this.publish(message)
              }
            })
          })
      } catch (e) {
        if (this.options.signal?.aborted) {
          // Break out of while loop when the user aborts the client.
          break
        } else {
          console.log(`fetch failed`, e)

          // Exponentially backoff on errors.
          // Wait for the current delay duration
          await new Promise((resolve) => setTimeout(resolve, delay))

          // Increase the delay for the next attempt
          delay = Math.min(delay * 1.3, maxDelay)

          attempt++
          console.log(`Retry attempt #${attempt} after ${delay}ms`)
        }
      }
    }

    console.log(`client is closed`, this.instanceId)
    this.outsideResolve()
  }

  subscribe(callback: (message: Message) => void) {
    this.subscribers.push(callback)
  }

  publish(message: Message) {
    for (const subscriber of this.subscribers) {
      subscriber(message)
    }
  }

  subscribeBatch(callback: (messages: Message[]) => void) {
    this.batchSubscribers.push(callback)
  }

  publishBatch(messages: Message[]) {
    for (const subscriber of this.batchSubscribers) {
      subscriber(messages)
    }
  }
}
