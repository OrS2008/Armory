import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '@/i18n';
import { Button } from '@/components/ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Structured, non-sensitive log line for the browser console / RUM.
    console.error('[shabatzak] render error', {
      message: error.message,
      info: info.componentStack,
    });
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        role="alert"
        className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center"
      >
        <h1 className="text-lg font-semibold">{t('state.errorTitle')}</h1>
        <p className="text-sm text-ink-muted">{t('state.errorBody')}</p>
        <Button onClick={() => window.location.reload()}>{t('app.retry')}</Button>
      </div>
    );
  }
}
