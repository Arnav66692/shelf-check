let sharedWorker: Worker | null = null;
let nextId = 0;

export function zephyrWorker(): Worker {
  if (!sharedWorker) sharedWorker = new Worker("/matcher/worker.js?v=5");
  return sharedWorker;
}

export function nextZephyrId(): number {
  nextId += 1;
  return nextId;
}
