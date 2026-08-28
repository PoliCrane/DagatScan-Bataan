import "./TourInfoButton.css";

export default function TourInfoButton({ onClick, label = "Show page tour" }) {
  return (
    <button className="tour-info-btn" onClick={onClick} title={label} aria-label={label}>
      <img src="/info.png" alt="" className="tour-info-icon" />
    </button>
  );
}
