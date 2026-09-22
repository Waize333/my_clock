export default function Loading() {
  return (
    <div className="page-loading" role="status" aria-live="polite">
      <span className="loading-indicator" />
      <h2>Opening your space…</h2>
      <p>Your saved work will appear in a moment.</p>
    </div>
  );
}
