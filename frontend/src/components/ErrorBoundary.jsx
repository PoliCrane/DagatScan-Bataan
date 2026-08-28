import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled render error:", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            fontFamily: "sans-serif",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <h2 style={{ color: "#0077B6", margin: 0 }}>Something went wrong</h2>
          <p style={{ color: "#555", margin: 0 }}>
            An unexpected error occurred while rendering this page.
          </p>
          <button
            type="button"
            onClick={() => window.location.assign("/")}
            style={{
              padding: "10px 20px",
              border: "none",
              borderRadius: "6px",
              background: "#0077B6",
              color: "white",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Back to Home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
