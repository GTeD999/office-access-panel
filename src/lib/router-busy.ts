let priorityDepth = 0;

export function isRouterPriorityActive(): boolean {
  return priorityDepth > 0;
}

export async function runWithRouterPriority<T>(fn: () => Promise<T>): Promise<T> {
  priorityDepth++;
  try {
    return await fn();
  } finally {
    priorityDepth--;
  }
}
