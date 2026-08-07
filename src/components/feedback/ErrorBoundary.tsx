import { Component, type ErrorInfo, type ReactNode } from 'react';
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    void error;
    void info; /* Production reporting is intentionally not configured yet. */
  }
  render() {
    return this.state.failed ? (
      <main className="fatal-state">
        <h1>לא הצלחנו לטעון את Armory</h1>
        <p>רעננו את הדף. אם התקלה חוזרת, פנו למנהל המערכת.</p>
        <button onClick={() => location.reload()}>רענון</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
