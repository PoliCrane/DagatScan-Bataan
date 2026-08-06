import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import AuthModals from "../components/AuthModals";
import SiteFooter from "../components/SiteFooter";
import FaqAccordion from "../components/FaqAccordion";
import IndexNavBar from "./indexNavBar";
import "./index-organized.css";
import "./styles/requestAccount.css";

const FAQ_ITEMS = [
  {
    question: "Who are qualified to have a DagatScan Bataan account?",
    answer:
      "DagatScan Bataan accounts are available only to authorized personnel from Municipal DENR Offices within the Province of Bataan. Please note that public users can still access the Coastal Monitoring, Erosion Analysis, Coastal Awareness, and Reports pages without creating an account.",
  },
  {
    question: "How do I submit my application for an account?",
    answer:
      "Submit a signed request letter addressed to the DENR-Bataan Administrator indicating your intention to request access to the DagatScan Bataan system. After your request has been reviewed and approved, your account will be created and your login credentials will be provided by the system administrator.",
  },
  {
    question: "What requirements do I have to submit?",
    bullets: ["Signed Request Letter"],
    note: "The request letter should indicate the applicant's name, position, office, and purpose for requesting access.",
  },
  {
    question: "What advantages will I get if I have an account?",
    bullets: [
      "Registered users can access the system dashboard and other features available only to authorized DENR personnel.",
    ],
  },
];

export default function RequestAccount() {
  const authModalsRef = useRef(null);
  const navigate = useNavigate();

  return (
    <div>
      <IndexNavBar
        onLoginClick={() => authModalsRef.current?.openLogin()}
        onRegisterClick={() => navigate("/request-account")}
        onForgotPasswordClick={() => authModalsRef.current?.openForgotPassword()}
        showMiddleNav={true}
      />

      <div className="request-account-section">
        <h1 className="request-account-heading">Request an Account</h1>
        <FaqAccordion items={FAQ_ITEMS} />
        <div className="request-account-cta">
          <button className="form-btn" onClick={() => navigate("/request-account/apply")}>
            Register Now
          </button>
        </div>
      </div>

      <SiteFooter />

      <AuthModals ref={authModalsRef} />
    </div>
  );
}
