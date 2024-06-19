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
          data.forEach((update) => {
            if (typeof update.lsn !== `undefined`) {
              lastLSN = Math.max(lastLSN, update.lsn);
            }
            if (update.type === `control` && update.data === `up-to-date`) {
              upToDate = true;
            }
            this.publish(update);
          });
        });
      } catch (e) {
        if (e.message !== `This operation was aborted`) {
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
  publish(updates) {
    for (const subscriber of this.subscribers) {
      subscriber(updates);
    }
  }
};
export {
  ShapeStream
};
