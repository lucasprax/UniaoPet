import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends (React.Component as new (...args: any[]) => any) {
  state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[UniãoPet ErrorBoundary] Uncaught component error:', error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#fafbfc] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full text-center shadow-xl border border-red-100">
            <div className="w-16 h-16 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-xl font-black text-gray-900 mb-2">Ops! Algo deu errado</h2>
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              O aplicativo encontrou uma inconsistência passageira e se recuperou com segurança para não fechar seus dados.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 py-3 px-4 bg-orange-50 hover:bg-orange-100 text-[#f08136] rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Tentar Novamente
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-3 px-4 bg-[#f08136] hover:bg-[#e07126] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md shadow-[#f08136]/20 cursor-pointer"
              >
                <RotateCcw size={14} />
                <span>Recarregar App</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
