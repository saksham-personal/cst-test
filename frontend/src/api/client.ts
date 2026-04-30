import axios from 'axios';
import { toast } from 'sonner';

export const apiClient = axios.create({
  baseURL: (import.meta as any).env.VITE_API_BASE || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Blob responses (downloads) need manual error parsing at the call site
    // since a JSON error body arrives as a Blob. Let the caller surface the
    // message with its own toast so we don't double-toast.
    const isBlob = error?.config?.responseType === 'blob';
    // Callers that want to handle errors inline can opt-out via header.
    const suppress = error?.config?.headers?.['X-Skip-Error-Toast'];
    if (!isBlob && !suppress) {
      const payload = error.response?.data;
      const detail = payload?.detail;
      const appMessage = payload?.error?.message;
      const message = typeof detail === 'string'
        ? detail
        : typeof appMessage === 'string'
          ? appMessage
        : (Array.isArray(detail) && detail[0]?.msg)
          ? detail.map((d: any) => d.msg).join('; ')
          : error.message || 'An unexpected error occurred';
      toast.error('API Error', {
        description: message,
      });
    }
    return Promise.reject(error);
  }
);
