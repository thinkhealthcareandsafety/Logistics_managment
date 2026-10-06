import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Contains a render crash to the page that threw it. Without this, one bad page blanks
 * the whole app - navigation included - and the only way out is a manual reload.
 * Layout keys it by route, so moving to another page clears the error.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-md py-20 text-center">
        <p className="text-sm font-semibold text-slate-900">Something went wrong on this page</p>
        <p className="mt-1 text-[13px] text-slate-500">
          Your data is safe. Reload to try again - if it keeps happening, let the team know what you were doing.
        </p>
        <button onClick={() => window.location.reload()} className="btn-secondary mt-5">
          Reload page
        </button>
      </div>
    );
  }
}
