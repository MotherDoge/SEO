import React, { StrictMode, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F0EEE9] flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md bg-white p-8 rounded-3xl border border-[#022386]/10 shadow-xl">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="font-heading text-2xl text-[#022386] mb-2 font-bold uppercase tracking-tight">Something went wrong</h1>
            <p className="text-gray-600 text-sm mb-6">
              The application encountered an unexpected runtime error.
            </p>
            {this.state.error && (
              <div className="bg-red-50 p-4 rounded-xl text-left font-mono text-xs text-red-800 overflow-auto max-h-40 mb-6 border border-red-100">
                <p className="font-bold">{this.state.error.toString()}</p>
                {this.state.error.stack && (
                  <pre className="mt-2 text-[10px] opacity-80 whitespace-pre-wrap">{this.state.error.stack}</pre>
                )}
              </div>
            )}
            <button
              onClick={() => {
                try {
                  window.localStorage.removeItem('seoClarity_runHistory');
                } catch (e) {}
                window.location.reload();
              }}
              className="px-6 py-2.5 bg-[#022386] text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-[#022386]/85 transition-colors"
            >
              Reset History & Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

