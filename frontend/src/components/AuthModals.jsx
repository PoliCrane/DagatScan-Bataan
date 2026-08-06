import { forwardRef, useImperativeHandle, useState } from "react";
import Modal from "./Modal";
import Login from "../pages/login";
import ForgotPassword from "../pages/forgotpass";
import ResetPassword from "../pages/resetpass";

// Hosts the Login/ForgotPassword/ResetPassword modals as one unit since they switch between each other; shared by index.jsx and navbar.jsx
const AuthModals = forwardRef(function AuthModals(_props, ref) {
  const [showLogin, setShowLogin] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState(null);

  useImperativeHandle(ref, () => ({
    openLogin: () => setShowLogin(true),
    openForgotPassword: () => setShowForgotPassword(true),
  }));

  return (
    <>
      <Modal isOpen={showLogin} onClose={() => setShowLogin(false)} noCloseButton={true} contentClassName="modal-content-login">
        <Login
          onClose={() => setShowLogin(false)}
          onSwitchToForgotPassword={() => {
            setShowLogin(false);
            setShowForgotPassword(true);
          }}
        />
      </Modal>

      <Modal isOpen={showForgotPassword} onClose={() => setShowForgotPassword(false)} noCloseButton={true}>
        <ForgotPassword
          onClose={() => setShowForgotPassword(false)}
          onSwitchToLogin={() => {
            setShowForgotPassword(false);
            setShowLogin(true);
          }}
          onSwitchToResetPassword={(email) => {
            setShowForgotPassword(false);
            setResetEmail(email);
            setShowResetPassword(true);
          }}
        />
      </Modal>

      <Modal isOpen={showResetPassword} onClose={() => setShowResetPassword(false)} noCloseButton={true}>
        <ResetPassword
          email={resetEmail}
          onClose={() => setShowResetPassword(false)}
          onSwitchToLogin={() => {
            setShowResetPassword(false);
            setShowLogin(true);
          }}
        />
      </Modal>
    </>
  );
});

export default AuthModals;
