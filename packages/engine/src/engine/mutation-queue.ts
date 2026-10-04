/** Single writer for a world's asynchronous mutations. Failures do not poison the queue. */
export class MutationQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    return result;
  }

  async idle(): Promise<void> {
    await this.tail;
  }
}
