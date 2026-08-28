import { Dialog } from "primereact/dialog";

export default function Modal({ isOpen, onClose, children, noCloseButton }) {
  return (
    <Dialog
      visible={isOpen}
      onHide={onClose}
      showHeader={!noCloseButton}
      modal
      draggable={false}
      dismissableMask
      style={{ width: "min(28rem, 92vw)" }}
    >
      {children}
    </Dialog>
  );
}
