import { AsyncLocalStorage } from "node:async_hooks";

interface TenantStore {
  mfdId: string;
}

const storage = new AsyncLocalStorage<TenantStore>();

export const TenantContext = {
  run<T>(mfdId: string, fn: () => T): T {
    return storage.run({ mfdId }, fn);
  },

  /** Throws if called outside a request scoped by TenantMiddleware — every DB query must go through this, never fall back to an unscoped query. */
  currentMfdId(): string {
    const store = storage.getStore();
    if (!store) {
      throw new Error("TenantContext accessed outside of a tenant-scoped request");
    }
    return store.mfdId;
  },
};
