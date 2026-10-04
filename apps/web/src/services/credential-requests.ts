/** Explicit probes/listings run on the main thread and must also stop when credentials lock/change. */
const active = new Set<AbortController>();
export function registerCredentialRequest(controller: AbortController): () => void {
  active.add(controller);
  return () => active.delete(controller);
}
export function abortCredentialRequests(): void {
  for (const controller of active) controller.abort();
  active.clear();
}
