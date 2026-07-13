export type RequestInterceptor = (url: string, options: RequestInit) => Promise<RequestInit> | RequestInit;
export type ResponseInterceptor = <T>(payload: T, response: Response) => Promise<T> | T;

const requestInterceptors: RequestInterceptor[] = [];
const responseInterceptors: ResponseInterceptor[] = [];

export function addRequestInterceptor(interceptor: RequestInterceptor) {
  requestInterceptors.push(interceptor);
  return () => removeItem(requestInterceptors, interceptor);
}

export function addResponseInterceptor(interceptor: ResponseInterceptor) {
  responseInterceptors.push(interceptor);
  return () => removeItem(responseInterceptors, interceptor);
}

export async function applyRequestInterceptors(url: string, options: RequestInit) {
  let next = options;
  for (const interceptor of requestInterceptors) {
    next = await interceptor(url, next);
  }
  return next;
}

export async function applyResponseInterceptors<T>(payload: T, response: Response) {
  let next = payload;
  for (const interceptor of responseInterceptors) {
    next = await interceptor(next, response);
  }
  return next;
}

function removeItem<T>(items: T[], item: T) {
  const index = items.indexOf(item);
  if (index >= 0) items.splice(index, 1);
}
