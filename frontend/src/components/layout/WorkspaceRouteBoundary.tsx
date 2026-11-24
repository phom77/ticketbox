import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Shows a loading message while a workspace page downloads, and a recovery
 * message if the page fails to load or render. A failed download usually means
 * a new release replaced the page files, so the action reloads the app.
 */
export function WorkspaceRouteBoundary({ children }: { children: ReactNode }) {
  return (
    <WorkspaceErrorBoundary>
      <Suspense fallback={<WorkspaceRouteLoading />}>{children}</Suspense>
    </WorkspaceErrorBoundary>
  );
}

function WorkspaceRouteLoading() {
  const { t } = useTranslation('shared');
  return <p role="status">{t('shared:workspaceRouteLoading')}</p>;
}

function WorkspaceRouteFailed() {
  const { t } = useTranslation('shared');
  return (
    <div className="state-panel" role="alert">
      <h2>{t('shared:workspaceRouteFailedTitle')}</h2>
      <p>{t('shared:workspaceRouteFailedBody')}</p>
      <button
        type="button"
        className="button button-primary"
        onClick={() => window.location.reload()}
      >
        {t('shared:workspaceRouteReload')}
      </button>
    </div>
  );
}

class WorkspaceErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Workspace page failed to load', error, info.componentStack);
  }

  render() {
    return this.state.failed ? <WorkspaceRouteFailed /> : this.props.children;
  }
}
