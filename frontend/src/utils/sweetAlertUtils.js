/**
 * SweetAlert2 Utility Module
 * Reusable alert/confirmation dialogs for React applications
 */

import Swal from "sweetalert2";

// confirmation dialog; resolves true if confirmed, false if cancelled
export const confirmAction = async (message, options = {}) => {
  const result = await Swal.fire({
    title: "Are you sure?",
    text: message,
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
    text: message,
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
    text: message,
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
    text: message,
    icon: "info",
    confirmButtonColor: "#0077B6",
    confirmButtonText: "OK",
    timer: 4000,
    timerProgressBar: true,
    zIndex: 10000,
    ...options,
  });
};

