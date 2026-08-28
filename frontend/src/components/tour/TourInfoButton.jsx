import "./TourInfoButton.css";

export default function TourInfoButton({ onClick, label = "Show page tour" }) {
  return (
    <button className="tour-info-btn" onClick={onClick} title={label} aria-label={label}>
      <i className="pi pi-info-circle tour-info-icon" aria-hidden="true" />
    </button>
  );
}
