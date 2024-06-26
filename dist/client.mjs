// client.ts
var ShapeStream = class {
  constructor(options) {
    this.subscribers = [];
    this.batchSubscribers = [];
    this.validateOptions(options);
    this.instanceId = Math.random();
    this.options = { subscribe: true, ...options };
    console.log(`constructor`, this);
    this.startStream();
    this.outsideResolve;
    this.closedPromise = new Promise((resolve) => {
      this.outsideResolve = resolve;
    });
  }
  validateOptions(options) {
    if (!options.shape || !options.shape.table || typeof options.shape.table !== `string`) {
      throw new Error(
        `Invalid shape option. It must be an object with a "table" property that is a string.`
      );
    }
    if (!options.baseUrl) {
      throw new Error(`Invalid shape option. It must provide the baseUrl`);
    }
    if (options.signal && !(options.signal instanceof AbortSignal)) {
      throw new Error(
        `Invalid signal option. It must be an instance of AbortSignal.`
      );
    }
  }
  async startStream() {
    var _a, _b;
    let lastOffset = this.options.offset || -1;
    let upToDate = false;
    let pollCount = 0;
    let attempt = 0;
    const maxDelay = 1e4;
    const initialDelay = 100;
    let delay = initialDelay;
    while (!((_a = this.options.signal) == null ? void 0 : _a.aborted) && (!upToDate || this.options.subscribe)) {
      pollCount += 1;
      const url = new URL(
        `${this.options.baseUrl}/shape/${this.options.shape.table}`
      );
      url.searchParams.set(`offset`, lastOffset.toString());
      if (upToDate) {
        url.searchParams.set(`live`, ``);
      } else {
        url.searchParams.set(`notLive`, ``);
      }
      console.log({
        lastOffset,
        upToDate,
        pollCount,
        url: url.toString()
      });
      try {
        await fetch(url.toString(), {
          signal: this.options.signal ? this.options.signal : void 0
        }).then(async (response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          attempt = 0;
          if (response.status === 204) {
            return [];
          }
          return response.json();
        }).then((data) => {
          this.publishBatch(data);
          data.forEach((message) => {
            var _a2, _b2;
            if (typeof message.offset !== `undefined`) {
              lastOffset = Math.max(lastOffset, message.offset);
            }
            if (((_a2 = message.headers) == null ? void 0 : _a2[`control`]) === `up-to-date`) {
              upToDate = true;
            }
            if (!((_b2 = this.options.signal) == null ? void 0 : _b2.aborted)) {
              this.publish(message);
            }
          });
        });
      } catch (e) {
        if ((_b = this.options.signal) == null ? void 0 : _b.aborted) {
          break;
        } else {
          console.log(`fetch failed`, e);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay = Math.min(delay * 1.3, maxDelay);
          attempt++;
          console.log(`Retry attempt #${attempt} after ${delay}ms`);
        }
      }
    }
    console.log(`client is closed`, this.instanceId);
    this.outsideResolve();
  }
  subscribe(callback) {
    this.subscribers.push(callback);
  }
  publish(message) {
    for (const subscriber of this.subscribers) {
      subscriber(message);
    }
  }
  subscribeBatch(callback) {
    this.batchSubscribers.push(callback);
  }
  publishBatch(messages) {
    for (const subscriber of this.batchSubscribers) {
      subscriber(messages);
    }
  }
};
export {
  ShapeStream
};
