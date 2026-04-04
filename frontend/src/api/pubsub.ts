import { apiFetch, getBaseUrl } from './client';

export const pubsubApi = {
  publish: (topic: string, message: string) =>
    apiFetch<{ topic: string; message: string; subscribers: number; timestamp: number }>(
      '/api/pubsub/publish',
      { method: 'POST', body: JSON.stringify({ topic, message }) }
    ),

  createEventSource: () => {
    const base = getBaseUrl();
    return new EventSource(`${base}/api/pubsub/subscribe`);
  },
};
