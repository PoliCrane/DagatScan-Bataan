export default function AsyncSection({
  loading = false,
  error = null,
  empty = false,
  emptyMessage = "No data available",
  loadingMessage = "Loading...",
  onRetry = null,
  children,
}) {
  if (loading) {
    return <div className="async-section async-section-loading">{loadingMessage}</div>;
  }

  if (error) {
    return (
      <div className="async-section async-section-error">
        <span>{typeof error === "string" ? error : "Something went wrong while loading this data."}</span>
        {onRetry && (
          <button type="button" onClick={onRetry} className="async-section-retry">
            Retry
          </button>
        )}
      </div>
    );
  }

  if (empty) {
    return <div className="async-section async-section-empty">{emptyMessage}</div>;
  }

  return children;
}
