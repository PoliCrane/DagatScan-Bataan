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
    return (
      <div className="my-4 rounded-card border border-line bg-panel px-5 py-8 text-center text-sm text-muted">
        {loadingMessage}
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-4 flex flex-wrap items-center justify-center gap-3 rounded-card border border-danger/40 bg-danger/10 px-5 py-6 text-center text-sm text-ink">
        <span>{typeof error === "string" ? error : "Something went wrong while loading this data."}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-primary-dark"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (empty) {
    return (
      <div className="my-4 rounded-card border border-dashed border-line bg-panel px-5 py-8 text-center text-sm text-muted">
        {emptyMessage}
      </div>
    );
  }

  return children;
}
