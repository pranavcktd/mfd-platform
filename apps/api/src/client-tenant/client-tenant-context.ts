import { AsyncLocalStorage } from "node:async_hooks";

interface ClientTenantStore {
  clientId: string;
  distributorId: string;
}

const storage = new AsyncLocalStorage<ClientTenantStore>();

/**
 * Same AsyncLocalStorage pattern as TenantContext (tenant/tenant-context.ts),
 * but scoped to the client-portal login — a distinct, separate auth surface
 * from the MFD's own Distributor login. Deliberately a separate module
 * (not a variant of TenantContext) so a client-portal request can never
 * accidentally read/write with distributor-level scope, and vice versa.
 */
export const ClientTenantContext = {
  run<T>(store: ClientTenantStore, fn: () => T): T {
    return storage.run(store, fn);
  },

  current(): ClientTenantStore {
    const store = storage.getStore();
    if (!store) {
      throw new Error("ClientTenantContext accessed outside of a client-portal-scoped request");
    }
    return store;
  },
};
