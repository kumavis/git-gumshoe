export function *count(n) {
  for (let i = 0; i < n; i++) {
    yield i;
  }
}

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// values must be a consumeable iterable (not an array)
export const asyncForEach = async (values, callback) => {
  for await (const value of values) {
    await callback(value);
  }
};

export const parallel = (limit, callback) => {
  function *workers() {
    for (const worker of count(limit)) {
      yield callback(worker);
    }
  }
  return Promise.all(workers());
};

// values must be a consumeable iterable (not an array)
export const parallelForEach = async (limit, values, callback) => {
  return parallel(limit, () => asyncForEach(values, callback));
};

// values must be a consumeable iterable (not an array)
export const asyncReduce = async (zero, values, callback) => {
  for await (const value of values) {
    zero = await callback(zero, value);
  }
  return zero;
};

// values must be a consumeable iterable (not an array)
export const parallelReduce = async (limit, zero, values, callback) => {
  values = await parallel(limit, () => asyncReduce(zero, values, callback));
  return asyncReduce(zero, values, callback);
};

export const defer = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

export const queue = () => {
  const ends = defer();
  const endSignal = Symbol('end');
  let endErr = null;
  return {
    put(value) {
      const next = defer();
      const promise = next.promise;
      ends.resolve({ value, promise });
      ends.resolve = next.resolve;
    },
    get() {
      const promise = ends.promise.then(next => next.value);
      ends.promise = ends.promise.then(next => next.promise);
      return promise;
    },
    // kumavis added these
    end (err) {
      if (err) endErr = err;
      this.put(endSignal);
    },
    async * [Symbol.asyncIterator]() {
      while (true) {
        const value = await this.get();
        if (value === endSignal) {
          if (endErr) throw endErr;
          return;
        }
        yield value;
      }
    }
  };
};

export const iterate = (obj) => {
  if (obj[Symbol.asyncIterator]) {
    return obj[Symbol.asyncIterator]();
  }
  if (obj[Symbol.iterator]) {
    return obj[Symbol.iterator]();
  };
  throw new Error('Object is not iterable');
}

// values must be a consumeable iterable (not an array)
export const parallelMapToQueue = (limit, values, callback) => {
  const resultQueue = queue();
  parallelForEach(limit, values, async (value) => {
    const result = await callback(value)
    resultQueue.put(result)
  })
    .then(() => resultQueue.end())
    .catch((err) => resultQueue.end(err));
  return resultQueue;
}
