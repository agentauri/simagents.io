type RedisStubMethod = (...args: unknown[]) => Promise<null>;

const noop: RedisStubMethod = async () => null;

export const redis = new Proxy<Record<string, RedisStubMethod>>({}, {
  get: () => noop,
});

export default redis;
