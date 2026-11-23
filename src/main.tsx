import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { ToastProvider } from './components/ui';
import './styles.css';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (n, e) => n < 2 && !(e as { status?: number }).status,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

// A file dropped outside a drop area would make the browser open it and leave the app.
for (const ev of ['dragover', 'drop'] as const) {
  window.addEventListener(ev, (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
}
