import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
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
    (this as any).setState({ errorInfo });
  }

  public render() {
    if ((this as any).state.hasError) {
      return (
        <div className="p-6 bg-red-950/20 border border-red-500/30 rounded-2xl max-w-2xl mx-auto my-8 text-white space-y-4">
          <h2 className="text-lg font-bold text-red-400 flex items-center gap-2">
            ⚠️ Một lỗi không mong muốn đã xảy ra trong giao diện
          </h2>
          <p className="text-xs text-gray-400">
            Ứng dụng bị sập khi tải thành phần này. Dưới đây là thông tin chi tiết lỗi để gỡ lỗi:
          </p>
          <div className="bg-black/50 p-4 rounded-xl border border-red-500/20 font-mono text-xs overflow-x-auto text-red-300 whitespace-pre-wrap">
            {(this as any).state.error?.toString()}
            {"\n\nComponent Stack:\n"}
            {(this as any).state.errorInfo?.componentStack}
          </div>
          <button
            onClick={() => (this as any).setState({ hasError: false, error: null, errorInfo: null })}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs transition-all active:scale-95"
          >
            Thử tải lại thành phần
          </button>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
