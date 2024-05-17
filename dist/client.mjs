var __defProp = Object.defineProperty;
var __knownSymbol = (name, symbol) => {
  return (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
};
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
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
var __await = function(promise, isYieldStar) {
  this[0] = promise;
  this[1] = isYieldStar;
};
var __asyncGenerator = (__this, __arguments, generator) => {
  var resume = (k, v, yes, no) => {
    try {
      var x = generator[k](v), isAwait = (v = x.value) instanceof __await, done = x.done;
      Promise.resolve(isAwait ? v[0] : v).then((y) => isAwait ? resume(k === "return" ? k : "next", v[1] ? { done: y.done, value: y.value } : y, yes, no) : yes({ value: y, done })).catch((e) => resume("throw", e, yes, no));
    } catch (e) {
      no(e);
    }
  };
  var method = (k) => it[k] = (x) => new Promise((yes, no) => resume(k, x, yes, no));
  var it = {};
  return generator = generator.apply(__this, __arguments), it[__knownSymbol("asyncIterator")] = () => it, method("next"), method("throw"), method("return"), it;
};
var __forAwait = (obj, it, method) => (it = obj[__knownSymbol("asyncIterator")]) ? it.call(obj) : (obj = obj[__knownSymbol("iterator")](), it = {}, method = (key, fn) => (fn = obj[key]) && (it[key] = (arg) => new Promise((yes, no, done) => (arg = fn.call(obj, arg), done = arg.done, Promise.resolve(arg.value).then((value) => yes({ value, done }), no)))), method("next"), method("return"), it);

// mod.js
if (typeof ReadableStream.prototype[Symbol.asyncIterator] !== "function") {
  ReadableStream.prototype[Symbol.asyncIterator] = function() {
    return __asyncGenerator(this, null, function* () {
      const reader = this.getReader();
      try {
        while (true) {
          const { done, value } = yield new __await(reader.read());
          if (done)
            return;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    });
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
function getShapeStream(shapeId, options) {
  return __async(this, null, function* () {
    const stream = new ReadableStream({
      start(controller) {
        return __async(this, null, function* () {
          try {
            let lastLSN = 0;
            let upToDate = false;
            let initialUrl = `http://localhost:3000/shape/issues`;
            if (options.lsn) {
              initialUrl += `?lsn=${options.lsn}`;
            }
            yield fetch(initialUrl, {
              signal: options.signal
            }).then((_0) => __async(this, [_0], function* ({ body }) {
              const readable = body.pipeThrough(new TextDecoderStream()).pipeThrough(new JSONLinesParseStream());
              try {
                for (var iter = __forAwait(readable), more, temp, error; more = !(temp = yield iter.next()).done; more = false) {
                  const update = temp.value;
                  controller.enqueue(update);
                  if (update.type === `data`) {
                    if (update.lsn > lastLSN) {
                      lastLSN = update.lsn;
                    }
                  }
                }
              } catch (temp) {
                error = [temp];
              } finally {
                try {
                  more && (temp = iter.return) && (yield temp.call(iter));
                } finally {
                  if (error)
                    throw error[0];
                }
              }
            }));
            console.log(`done with initial fetch`);
            while (options.subscribe || !upToDate) {
              console.log({ lastLSN, upToDate, options: options.subscribe });
              yield fetch(`http://localhost:3000/shape/issues?lsn=${lastLSN}`, {
                signal: options.signal
              }).then((_0) => __async(this, [_0], function* ({ body }) {
                const readable = body.pipeThrough(new TextDecoderStream()).pipeThrough(new JSONLinesParseStream());
                try {
                  for (var iter = __forAwait(readable), more, temp, error; more = !(temp = yield iter.next()).done; more = false) {
                    const update = temp.value;
                    controller.enqueue(update);
                    if (update.type === `data`) {
                      lastLSN = update.lsn;
                    }
                    if (update.type === `up-to-date`) {
                      upToDate = true;
                    }
                  }
                } catch (temp) {
                  error = [temp];
                } finally {
                  try {
                    more && (temp = iter.return) && (yield temp.call(iter));
                  } finally {
                    if (error)
                      throw error[0];
                  }
                }
              }));
            }
            controller.close();
          } catch (error) {
          }
        });
      }
    });
    return stream;
  });
}
export {
  getShapeStream
};
