import { useNavigate, useLocation } from "react-router-dom";
import "./index-organized.css";

export default function IndexNavBar({ onLoginClick, onRegisterClick, onForgotPasswordClick, showMiddleNav }){

const navigate = useNavigate();
const location = useLocation();
const token = localStorage.getItem("token");

const scrollToSection = (sectionId) => {
  if (location.pathname !== "/") {
    navigate("/");
    setTimeout(() => {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    }, 100);
  } else {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  }
};

const logout = () => {
  localStorage.removeItem("token");
  navigate("/index");
};

return(

<div className="navbar">

<div className="navbar-brand">
  <img src="/DSLogo.png" alt="DagatScan Bataan Logo" className="navbar-logo" />
  <div className="dagatscanheader">
    <h3>DagatScan <span>Bataan</span></h3> 
  </div>
</div>

{showMiddleNav && (
  <div className="navbar-middle">
    <button
      className="navbar-middle-btn"
      onClick={() => scrollToSection("home")}
    >
      Home
    </button>
    <button
      className="navbar-middle-btn"
      onClick={() => scrollToSection("features")}
    >
      Features
    </button>
    <button
      className="navbar-middle-btn"
      onClick={() => scrollToSection("about")}
    >
      About
    </button>
  </div>
)}

<div className="navbar-buttons">

{token ? (
  <>
    <button
      className="navbar-btn"
      onClick={()=>navigate("/home")}
    >
      Home
    </button>

    <button
      className="navbar-btn logout-btn"
      onClick={logout}
    >
      Logout
    </button>
  </>
) : (
  <>
    {onLoginClick && (
      <button
        className="navbar-btn"
        onClick={onLoginClick}
      >
        Login
      </button>
    )}
    {onRegisterClick && (
      <button
        className="navbar-btn2"
        onClick={onRegisterClick}
      >
        Request Access
      </button>
    )}
  </>
)}

</div>

</div>

)
}
