/**
 * SweetAlert2 Utility Module
 * Reusable alert/confirmation dialogs for React applications
 */

import Swal from "sweetalert2";

// confirmation dialog; resolves true if confirmed, false if cancelled
export const confirmAction = async (message, options = {}) => {
  const result = await Swal.fire({
    title: "Are you sure?",
    html: message,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#0077B6",
    cancelButtonColor: "#a70000",
    confirmButtonText: "Yes, confirm",
    cancelButtonText: "Cancel",
    zIndex: 10000,
    ...options,
  });

  return result.isConfirmed;
};

// loading dialog with spinner, auto-closes after duration ms
export const showLoading = async (message = "Loading...", duration = 3000) => {
  Swal.fire({
    title: message,
    allowOutsideClick: false,
    allowEscapeKey: false,
    zIndex: 10000,
    didOpen: async () => {
      Swal.showLoading();
    },
  });

  return new Promise((resolve) => {
    setTimeout(() => {
      Swal.close();
      resolve();
    }, duration);
  });
};

// success message
export const showSuccess = async (message, options = {}) => {
  await Swal.fire({
    title: "Success!",
    html: message,
    icon: "success",
    confirmButtonColor: "#0077B6",
    confirmButtonText: "OK",
    timer: 3000,
    timerProgressBar: true,
    zIndex: 10000,
    ...options,
  });
};

// error message
export const showError = async (message, options = {}) => {
  await Swal.fire({
    title: "Error!",
    html: message,
    icon: "error",
    confirmButtonColor: "#a70000",
    confirmButtonText: "OK",
    zIndex: 10000,
    ...options,
  });
};

// info/warning message
export const showInfo = async (message, options = {}) => {
  await Swal.fire({
    title: "Information",
    html: message,
    icon: "info",
    confirmButtonColor: "#0077B6",
    confirmButtonText: "OK",
    timer: 4000,
    timerProgressBar: true,
    zIndex: 10000,
    ...options,
  });
};

// custom dialog with multiple action buttons
export const customDialog = async ({
  title = "Dialog",
  message = "",
  icon = "info",
  actions = [
    { text: "OK", value: "ok", color: "#0077B6" },
    { text: "Cancel", value: "cancel", color: "#999" },
  ],
} = {}) => {
  const buttons = actions.map((action) =>
    Swal.DismissReason.CANCEL !== action.value
      ? `<button id="action-${action.value}" style="
          padding: 8px 16px;
          margin: 5px;
          border: none;
          border-radius: 4px;
          background-color: ${action.color};
          color: white;
          font-weight: 600;
          cursor: pointer;
        ">${action.text}</button>`
      : ""
  );

  await Swal.fire({
    title,
    html: `${message}<div class="custom-buttons">${buttons.join("")}</div>`,
    icon,
    showConfirmButton: false,
    zIndex: 10000,
    didOpen: async () => {
      for (const action of actions) {
        const button = document.getElementById(`action-${action.value}`);
        if (button) {
          button.addEventListener("click", () => {
            Swal.close();
          });
        }
      }
    },
  });
};
