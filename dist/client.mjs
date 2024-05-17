var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateGet = (obj, member, getter) => {
  __accessCheck(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateSet = (obj, member, value, setter) => {
  __accessCheck(obj, member, "write to private field");
  setter ? setter.call(obj, value) : member.set(obj, value);
  return value;
};
var __privateWrapper = (obj, member, setter, getter) => ({
  set _(value) {
    __privateSet(obj, member, value, setter);
  },
  get _() {
    return __privateGet(obj, member, getter);
  }
});
var __privateMethod = (obj, member, method) => {
  __accessCheck(obj, member, "access private method");
  return method;
};

// mod.js
if (typeof ReadableStream.prototype[Symbol.asyncIterator] !== "function") {
  ReadableStream.prototype[Symbol.asyncIterator] = async function* () {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done)
          return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}
"\r".charCodeAt(0);
"\n".charCodeAt(0);
var _buf, _delimiter, _inspectIndex, _matchIndex, _delimLPS, _handle, handle_fn;
var TextDelimiterStream = class extends TransformStream {
  constructor(delimiter) {
    super({
      transform: (chunk5, controller7) => {
        __privateMethod(this, _handle, handle_fn).call(this, chunk5, controller7);
      },
      flush: (controller8) => {
        controller8.enqueue(__privateGet(this, _buf));
      }
    });
    __privateAdd(this, _handle);
    __privateAdd(this, _buf, "");
    __privateAdd(this, _delimiter, void 0);
    __privateAdd(this, _inspectIndex, 0);
    __privateAdd(this, _matchIndex, 0);
    __privateAdd(this, _delimLPS, void 0);
    __privateSet(this, _delimiter, delimiter);
    __privateSet(this, _delimLPS, createLPS(new TextEncoder().encode(delimiter)));
  }
};
_buf = new WeakMap();
_delimiter = new WeakMap();
_inspectIndex = new WeakMap();
_matchIndex = new WeakMap();
_delimLPS = new WeakMap();
_handle = new WeakSet();
handle_fn = function(chunk6, controller9) {
  __privateSet(this, _buf, __privateGet(this, _buf) + chunk6);
  let localIndex = 0;
  while (__privateGet(this, _inspectIndex) < __privateGet(this, _buf).length) {
    if (chunk6[localIndex] === __privateGet(this, _delimiter)[__privateGet(this, _matchIndex)]) {
      __privateWrapper(this, _inspectIndex)._++;
      localIndex++;
      __privateWrapper(this, _matchIndex)._++;
      if (__privateGet(this, _matchIndex) === __privateGet(this, _delimiter).length) {
        const matchEnd = __privateGet(this, _inspectIndex) - __privateGet(this, _delimiter).length;
        const readyString = __privateGet(this, _buf).slice(0, matchEnd);
        controller9.enqueue(readyString);
        __privateSet(this, _buf, __privateGet(this, _buf).slice(__privateGet(this, _inspectIndex)));
        __privateSet(this, _inspectIndex, 0);
        __privateSet(this, _matchIndex, 0);
      }
    } else {
      if (__privateGet(this, _matchIndex) === 0) {
        __privateWrapper(this, _inspectIndex)._++;
        localIndex++;
      } else {
        __privateSet(this, _matchIndex, __privateGet(this, _delimLPS)[__privateGet(this, _matchIndex) - 1]);
      }
    }
  }
};
function createLPS(pat) {
  const lps = new Uint8Array(pat.length);
  lps[0] = 0;
  let prefixEnd = 0;
  let i = 1;
  while (i < lps.length) {
    if (pat[i] == pat[prefixEnd]) {
      prefixEnd++;
      lps[i] = prefixEnd;
      i++;
    } else if (prefixEnd === 0) {
      lps[i] = 0;
      i++;
    } else {
      prefixEnd = lps[prefixEnd - 1];
    }
  }
  return lps;
}
var _separatorDelimitedJSONParser;
var JSONLinesParseStream = class {
  constructor({ separator = "\n", writableStrategy, readableStrategy } = {}) {
    __publicField(this, "writable");
    __publicField(this, "readable");
    __privateAdd(this, _separatorDelimitedJSONParser, (chunk, controller) => {
      if (!isBrankString(chunk)) {
        controller.enqueue(parse(chunk));
      }
    });
    const delimiterStream = new TextDelimiterStream(separator);
    const jsonParserStream = new TransformStream({
      transform: __privateGet(this, _separatorDelimitedJSONParser)
    }, writableStrategy, readableStrategy);
    this.writable = delimiterStream.writable;
    this.readable = delimiterStream.readable.pipeThrough(jsonParserStream);
  }
};
_separatorDelimitedJSONParser = new WeakMap();
function parse(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof Error) {
      const truncatedText = 30 < text.length ? `${text.slice(0, 30)}...` : text;
      throw new error.constructor(`${error.message} (parsing: '${truncatedText}')`);
    }
    throw error;
  }
}
var blank = new Set(" 	\r\n");
var branks = /[^ \t\r\n]/;
function isBrankString(str) {
  return !branks.test(str);
}
var JSONLinesStringifyStream = class extends TransformStream {
  constructor(options = {}) {
    const { separator = "\n", writableStrategy, readableStrategy } = options;
    const [prefix, suffix] = separator.includes("\n") ? [
      "",
      separator
    ] : [
      separator,
      "\n"
    ];
    super({
      transform(chunk, controller) {
        controller.enqueue(`${prefix}${JSON.stringify(chunk)}${suffix}`);
      }
    }, writableStrategy, readableStrategy);
  }
};

// client.ts
async function getShapeStream(shapeId, options) {
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let lastLSN = options.lsn || -1;
        let upToDate = false;
        while (!upToDate || options.subscribe) {
          console.log({ lastLSN, upToDate, options: options.subscribe });
          await fetch(`http://localhost:3000/shape/issues?lsn=${lastLSN}`, {
            signal: options.signal
          }).then(async ({ body }) => {
            const readable = body.pipeThrough(new TextDecoderStream()).pipeThrough(new JSONLinesParseStream());
            for await (const update of readable) {
              controller.enqueue(update);
              if (update.type === `data`) {
                lastLSN = update.lsn;
              }
              if (update.type === `up-to-date`) {
                upToDate = true;
              }
            }
          });
        }
        controller.close();
      } catch (error) {
      }
    }
  });
  return stream;
}
export {
  getShapeStream
};
