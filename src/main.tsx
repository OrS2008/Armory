import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from '@/app/providers/AppProviders';
import { AppRouter } from '@/app/router/AppRouter';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';
import { applyTheme, readThemeChoice } from '@/lib/theme';
import '@/styles/index.css';

// Before the first render, so a reader who chose dark does not get a white
// flash on every navigation to the app.
applyTheme(readThemeChoice());

const container = document.getElementById('root');
if (!container) throw new Error('Root container missing');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProviders>
        <AppRouter />
      </AppProviders>
    </ErrorBoundary>
  </StrictMode>,
);
