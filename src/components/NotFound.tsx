import { Home, AlertCircle } from 'lucide-react';

// Navigation in this app is state-based (no react-router), so this component
// must not render <Link> — doing so outside a <Router> throws at runtime.
// The parent passes an onGoHome callback that returns to a known view.
export default function NotFound({ onGoHome }: { onGoHome?: () => void }) {
  const goHome = onGoHome ?? (() => window.location.reload());

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <AlertCircle className="w-24 h-24 text-red-400 mx-auto mb-4" />
          <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
          <h2 className="text-2xl font-semibold text-gray-700 mb-2">
            Page Not Found
          </h2>
          <p className="text-gray-600 mb-8">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        <div className="space-y-4">
          <button
            type="button"
            onClick={goHome}
            className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors w-full sm:w-auto"
          >
            <Home className="w-5 h-5 mr-2" />
            Go to Today
          </button>
        </div>
      </div>
    </div>
  );
}
