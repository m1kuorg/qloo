// The tests' count of the subrequests a Worker invocation makes: test/sample-launches.test.tsx counts the
// daily cron's run with it, and test/wipe-retry.test.ts the hourly retry's.
import { env } from 'cloudflare:workers'

// The Worker's bindings, counting each subrequest an invocation makes through them, each kind apart, as
// Cloudflare's Free plan limits them (TRD): each D1 query or batch, 50 of which D1's limits allow, though
// the probe on #336 ran 1,000, and each call to a Durable Object, the agents' start that getAgentByName
// makes included, which counts with the D1 queries toward the 1,000 subrequests to Cloudflare services, not
// the 50 external ones. What the agents and gateways do inside counts toward their own.
export function counting() {
  const counted = { d1: 0, durableObjects: 0 }
  const call = <T extends object>(target: T, key: string | symbol, kind: keyof typeof counted) => {
    const value = Reflect.get(target, key)
    return typeof value === 'function'
      ? (...args: unknown[]) => {
          counted[kind]++
          return Reflect.apply(value, target, args)
        }
      : value
  }
  // A Durable Object's stub: each method it's called with, or property it's read, goes to the object.
  const stub = <T extends object>(target: T) =>
    new Proxy(target, {
      get: (t, key) => {
        if (key === 'then' || typeof key === 'symbol') return Reflect.get(t, key)
        const value = Reflect.get(t, key)
        if (typeof value !== 'function') counted.durableObjects++
        return call(t, key, 'durableObjects')
      }
    })
  const namespace = <T extends DurableObjectNamespace>(target: T) =>
    new Proxy(target, {
      get: (t, key) => {
        const value = Reflect.get(t, key)
        if (key === 'get' || key === 'getByName')
          return (...args: unknown[]) => stub(Reflect.apply(value as (...a: unknown[]) => object, t, args))
        return typeof value === 'function' ? value.bind(t) : value
      }
    })
  // D1: a statement counts as it runs, and a batch, or an exec, once.
  const real = new WeakMap<object, D1PreparedStatement>()
  const statement = (target: D1PreparedStatement): D1PreparedStatement => {
    const proxy = new Proxy(target, {
      get: (t, key) => {
        if (key === 'bind') return (...args: unknown[]) => statement(t.bind(...args))
        if (['run', 'all', 'first', 'raw'].includes(String(key))) return call(t, key, 'd1')
        const value = Reflect.get(t, key)
        return typeof value === 'function' ? value.bind(t) : value
      }
    })
    real.set(proxy, target)
    return proxy
  }
  const db = new Proxy(env.DB, {
    get: (t, key) => {
      if (key === 'prepare') return (sql: string) => statement(t.prepare(sql))
      if (key === 'batch')
        return (statements: D1PreparedStatement[]) => {
          counted.d1++
          return t.batch(statements.map((s) => real.get(s) ?? s))
        }
      return call(t, key, 'd1')
    }
  })
  const bindings = {
    DB: db,
    NetworkAgent: namespace(env.NetworkAgent),
    LaunchAgent: namespace(env.LaunchAgent),
    QlooGateway: namespace(env.QlooGateway)
  }
  return {
    counted,
    env: new Proxy(env, { get: (t, key) => (bindings as Record<string | symbol, unknown>)[key] ?? Reflect.get(t, key) })
  }
}
