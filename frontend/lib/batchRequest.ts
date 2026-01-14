/**
 * Batch Request Utility
 * 
 * Prevents overwhelming the backend by limiting concurrent requests.
 * Processes requests in batches of MAX_CONCURRENT_REQUESTS.
 */

const MAX_CONCURRENT_REQUESTS = 50; // Match backend limit

/**
 * Process async operations in batches to prevent overload.
 * 
 * @param items - Array of items to process
 * @param processFn - Async function to process each item
 * @param batchSize - Maximum concurrent operations (default: 50)
 * @returns Array of results
 * 
 * @example
 * const campaigns = await batchProcess(
 *   campaignIds,
 *   (id) => api.get(`/campaign/${id}`),
 *   50
 * );
 */
export async function batchProcess<T, R>(
  items: T[],
  processFn: (item: T) => Promise<R>,
  batchSize: number = MAX_CONCURRENT_REQUESTS
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)} (${batch.length} items)`);
    
    // Process batch in parallel (max batchSize at a time)
    const batchResults = await Promise.all(
      batch.map(item => processFn(item))
    );
    
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Execute multiple API calls in parallel with automatic batching.
 * 
 * @param promises - Array of promise-returning functions
 * @param batchSize - Maximum concurrent operations (default: 50)
 * @returns Array of results
 * 
 * @example
 * const [campaigns, phases, data] = await batchedPromiseAll([
 *   () => api.get('/campaign'),
 *   () => api.get('/phase'),
 *   () => api.get('/show_data')
 * ]);
 */
export async function batchedPromiseAll<T>(
  promises: (() => Promise<T>)[],
  batchSize: number = MAX_CONCURRENT_REQUESTS
): Promise<T[]> {
  return batchProcess(promises, (promiseFn) => promiseFn(), batchSize);
}

/**
 * Execute requests in parallel with controlled concurrency.
 * Processes tasks with a maximum number of concurrent executions.
 * 
 * @param requests - Array of async functions (tasks) to execute
 * @param maxConcurrent - Maximum number of concurrent requests (default: 50)
 * @returns Array of results in the same order as input
 * 
 * @example
 * const tasks = chunks.map(chunk => async () => {
 *   return await api.post('/chunk/upsert-single', { chunk_id: chunk.id });
 * });
 * const results = await batchRequests(tasks, 10);
 */
export async function batchRequests<T>(
  requests: (() => Promise<T>)[],
  maxConcurrent: number = MAX_CONCURRENT_REQUESTS
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  for (let i = 0; i < requests.length; i++) {
    const request = requests[i];
    
    // Create promise that executes the request
    const promise = request().then(result => {
      results[i] = result;
    });

    executing.push(promise);

    // If we've hit the concurrent limit, wait for one to finish
    if (executing.length >= maxConcurrent) {
      await Promise.race(executing);
      // Remove completed promises
      executing.splice(0, executing.findIndex(p => p === promise) + 1);
    }
  }

  // Wait for all remaining requests to complete
  await Promise.all(executing);
  
  return results;
}

/**
 * Parallel API requests with batching for large datasets.
 * Automatically handles pagination and batching.
 * 
 * @example
 * // Fetch 100 campaigns in batches of 50
 * const campaigns = await Promise.all(
 *   campaignIds.map(id => api.get(`/campaign/${id}`))
 * ); // This will be limited to 50 concurrent by browser
 * 
 * // Better: Use batchProcess for explicit control
 * const campaigns = await batchProcess(
 *   campaignIds,
 *   (id) => api.get(`/campaign/${id}`),
 *   50  // Explicit batch size
 * );
 */

/**
 * Rate-limited request queue for API calls.
 * Ensures no more than MAX_CONCURRENT_REQUESTS are in-flight at once.
 */
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private running = 0;
  private maxConcurrent: number;

  constructor(maxConcurrent: number = MAX_CONCURRENT_REQUESTS) {
    this.maxConcurrent = maxConcurrent;
  }

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.running++;
    const fn = this.queue.shift();
    
    if (fn) {
      try {
        await fn();
      } finally {
        this.running--;
        this.process(); // Process next in queue
      }
    }
  }
}

// Shared request queue instance
const globalRequestQueue = new RequestQueue(MAX_CONCURRENT_REQUESTS);

/**
 * Add request to global queue with automatic rate limiting.
 * 
 * @example
 * const campaign = await queuedRequest(() => api.get('/campaign/1'));
 */
export function queuedRequest<T>(fn: () => Promise<T>): Promise<T> {
  return globalRequestQueue.add(fn);
}

export { MAX_CONCURRENT_REQUESTS };
