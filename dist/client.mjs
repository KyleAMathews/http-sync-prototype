// client.ts
var ShapeStream = class {
  constructor(options = { subscribe: true }) {
    this.subscribers = [];
    this.instanceId = Math.random();
    this.options = options;
    console.log(`constructor`, this);
    this.startStream();
    this.outsideResolve;
    this.closedPromise = new Promise((resolve) => {
      this.outsideResolve = resolve;
    });
  }
  async startStream() {
    var _a;
    let lastLSN = this.options.lsn || -1;
    let upToDate = false;
    let pollCount = 0;
    let attempt = 0;
    const maxDelay = 1e4;
    const initialDelay = 100;
    let delay = initialDelay;
    while (!((_a = this.options.signal) == null ? void 0 : _a.aborted) && (!upToDate || this.options.subscribe)) {
      pollCount += 1;
      let url = `http://localhost:3000/shape/${this.options.shape.table}?lsn=${lastLSN}`;
      if (pollCount === 2) {
        url += `&catchup`;
      } else if (upToDate) {
        url += `&live`;
      }
      console.log({
        lastLSN,
        upToDate,
        pollCount,
        url
      });
      try {
        await fetch(url, {
          signal: this.options.signal ? this.options.signal : void 0
        }).then(async (response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          attempt = 0;
          return response.json();
        }).then((data) => {
          data.forEach((message) => {
            var _a2, _b;
            if (typeof message.lsn !== `undefined`) {
              lastLSN = Math.max(lastLSN, message.lsn);
            }
            if ((_a2 = message.headers) == null ? void 0 : _a2.some(
              ({ key, value }) => key === `control` && value === `up-to-date`
            )) {
              upToDate = true;
            }
            if (!((_b = this.options.signal) == null ? void 0 : _b.aborted)) {
              this.publish(message);
            }
          });
        });
      } catch (e) {
        if (e.message !== `This operation was aborted`) {
          console.log(`fetch failed`, e);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay = Math.min(delay * 1.3, maxDelay);
          attempt++;
          console.log(`Retry attempt #${attempt} after ${delay}ms`);
        } else {
          break;
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
};
export {
  ShapeStream
};
