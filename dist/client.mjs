// client.ts
var ShapeStream = class {
  constructor(options = { subscribe: true }) {
    this.subscribers = [];
    this.options = options;
    console.log(`constructor`, this.options);
    this.startStream();
  }
  async startStream() {
    try {
      let lastLSN = this.options.lsn || -1;
      let upToDate = false;
      while (!upToDate || this.options.subscribe) {
        console.log({ lastLSN, upToDate, options: this.options.subscribe });
        await fetch(`http://localhost:3000/shape/issues?lsn=${lastLSN}`, {
          signal: this.options.signal
        }).then((response) => response.json()).then((data) => {
          let foundLsn = false;
          data.forEach((update) => {
            if (update.type === `data`) {
              lastLSN = update.lsn;
              foundLsn = true;
            }
            if (update.type === `up-to-date`) {
              upToDate = true;
            }
            this.publish(update);
          });
        });
      }
      console.log(`client is closed`);
    } catch (error) {
    }
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
