/** Only the worker area itself, not owner routes such as /workers. */
export function isWorkerPath(path: string) {
  return path === "/worker" || path.startsWith("/worker/");
}
