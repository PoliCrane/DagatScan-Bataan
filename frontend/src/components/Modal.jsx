import "./Modal.css";

export default function Modal({ isOpen, onClose, children, noCloseButton, contentClassName = "" }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-content ${contentClassName}`.trim()} onClick={(e) => e.stopPropagation()}>
        {!noCloseButton && (
          <button className="modal-close" onClick={onClose}>✕</button>
        )}
        {children}
      </div>
    </div>
  );
}
