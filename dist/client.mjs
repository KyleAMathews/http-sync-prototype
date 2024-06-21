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
    let lastLSN = this.options.lsn || -1;
    let upToDate = false;
    let pollCount = 0;
    while (!upToDate || this.options.subscribe) {
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
          signal: this.options.signal
        }).then((response) => response.json()).then((data) => {
          data.forEach((message) => {
            var _a;
            if (typeof message.lsn !== `undefined`) {
              lastLSN = Math.max(lastLSN, message.lsn);
            }
            if ((_a = message.headers) == null ? void 0 : _a.some(
              ({ key, value }) => key === `control` && value === `up-to-date`
            )) {
              upToDate = true;
            }
            this.publish(message);
          });
        });
      } catch (e) {
        if (e.message !== `This operation was aborted`) {
          console.log(`fetch failed`, e);
          throw e;
        }
        break;
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
