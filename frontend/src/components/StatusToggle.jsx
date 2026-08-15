// Toggle-switch icon for active/inactive state. Purely visual + click handler;
// confirmation and the API call live in the parent. Inline SVG so both states
// can be recolored from one shape. Labels default to account wording.
export default function StatusToggle({
  active,
  onToggle,
  disabled = false,
  deactivateLabel = "Deactivate account",
  activateLabel = "Reactivate account",
}) {
  const label = active ? deactivateLabel : activateLabel;
  return (
    <button
      type="button"
      className="status-toggle-btn"
      onClick={onToggle}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      <svg width="36" height="20" viewBox="0 0 36 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect
          x="0.5"
          y="0.5"
          width="35"
          height="19"
          rx="9.5"
          fill={active ? "#388e3c" : "#c9c9c9"}
          stroke={active ? "#2e7d32" : "#b0b0b0"}
        />
        <circle cx={active ? "26" : "10"} cy="10" r="7" fill="#fff" />
      </svg>
    </button>
  );
}
