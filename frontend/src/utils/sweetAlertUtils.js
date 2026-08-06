/**
 * SweetAlert2 Utility Module
 * Reusable alert/confirmation dialogs for React applications
 */

import Swal from "sweetalert2";

/**
 * Show a confirmation dialog
 * @param {string} message - Confirmation message to display
 * @param {Object} options - Additional SweetAlert2 options
 * @returns {Promise<boolean>} - True if confirmed, false if cancelled
 */
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

/**
 * Show a loading dialog with spinner
 * @param {string} message - Loading message to display
 * @param {number} duration - How long to show (in ms), default 3000
 * @returns {Promise<void>}
 */
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

/**
 * Show a success message
 * @param {string} message - Success message to display
 * @param {Object} options - Additional SweetAlert2 options
 * @returns {Promise<void>}
 */
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

/**
 * Show an error message
 * @param {string} message - Error message to display
 * @param {Object} options - Additional SweetAlert2 options
 * @returns {Promise<void>}
 */
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

/**
 * Show an info/warning message
 * @param {string} message - Message to display
 * @param {Object} options - Additional SweetAlert2 options
 * @returns {Promise<void>}
 */
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

/**
 * Show a custom dialog with multiple actions
 * @param {Object} config - Configuration object
 * @returns {Promise<string>} - The action that was clicked
 */
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
