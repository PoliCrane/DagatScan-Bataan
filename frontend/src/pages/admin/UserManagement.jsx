import AdminLayout from "../../components/AdminLayout";
import AddAccountModal from "../../components/AddAccountModal";
import EditAccountModal from "../../components/EditAccountModal";
import ApproveRequestModal from "../../components/ApproveRequestModal";
import RejectRequestModal from "../../components/RejectRequestModal";
import StatusToggle from "../../components/StatusToggle";
import { useState, useEffect } from "react";
import "../index-organized.css";
import { showSuccess, showError, confirmAction, showLoading } from "../../utils/sweetAlertUtils";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import useGuidedTour from "../../hooks/useGuidedTour";
import TourInfoButton from "../../components/tour/TourInfoButton";
import { TOUR_PAGE_IDS } from "../../tours/pageIds";
import { userManagementSteps } from "../../tours/steps/userManagementSteps";

import { API_BASE_URL } from "../../config/api";
const formatJoinedDate = (isoString) =>
  new Date(isoString).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

export default function UserManagement() {
  const { Tour, replay } = useGuidedTour(TOUR_PAGE_IDS.USER_MANAGEMENT, userManagementSteps);

  const [superadmins, setSuperadmins] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [municipalAccounts, setMunicipalAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);

  const [pendingRequests, setPendingRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approvingRequest, setApprovingRequest] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingRequest, setRejectingRequest] = useState(null);

  const currentUserRole = localStorage.getItem("roles");
  const isSuperadmin = currentUserRole === "superadmin";

  useEffect(() => {
    fetchUsers();
    fetchAccountRequests();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/admin/users`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }

      const data = await response.json();
      setSuperadmins(data.filter(u => u.roles === "superadmin"));
      setAdmins(data.filter(u => u.roles === "admin"));
      setMunicipalAccounts(data.filter(u => u.roles === "municipal"));
      setError("");
    } catch (err) {
      await showError(err.message);
      setError(err.message);
      console.error("Error fetching users:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAccountRequests = async () => {
    try {
      setRequestsLoading(true);
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/admin/account-requests`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error("Failed to fetch account requests");
      }

      const data = await response.json();
      setPendingRequests(data);
    } catch (err) {
      console.error("Error fetching account requests:", err);
    } finally {
      setRequestsLoading(false);
    }
  };

  const handleViewLetter = async (requestId) => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/admin/account-requests/${requestId}/letter`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Could not load the request letter");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      await showError(err.message);
    }
  };

  const handleApproveRequest = (request) => {
    setApprovingRequest(request);
    setShowApproveModal(true);
  };

  const handleRejectRequest = (request) => {
    setRejectingRequest(request);
    setShowRejectModal(true);
  };

  const handleAddAdmin = () => {
    setShowAddModal(true);
  };

  const handleEdit = (account) => {
    setEditingAccount(account);
    setShowEditModal(true);
  };

  const handleDeactivate = async (account) => {
    const result = await confirmAction(
      `Are you sure you want to deactivate ${account.username}? They will not be able to log in, but their data will be preserved.`,
      {
        confirmButtonText: "Deactivate",
        cancelButtonText: "Cancel"
      }
    );

    if (!result) return;

    setDeletingUserId(account.id);
    await showLoading(`Deactivating ${account.username}...`, 2000);

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/admin/users/${account.id}/deactivate`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      let errorMessage = "Failed to deactivate user";

      if (!response.ok) {
        try {
          const data = await response.json();
          errorMessage = data.error || errorMessage;
        } catch (parseErr) {
          console.error("Could not parse error response:", parseErr);
        }
        throw new Error(errorMessage);
      }

      await showSuccess(`User ${account.username} deactivated successfully`);
      fetchUsers();
    } catch (err) {
      await showError(err.message);
      console.error("Error deactivating user:", err);
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleReactivate = async (account) => {
    const result = await confirmAction(
      `Are you sure you want to reactivate ${account.username}? They will be able to log in again.`,
      {
        confirmButtonText: "Reactivate",
        cancelButtonText: "Cancel"
      }
    );

    if (!result) return;

    setDeletingUserId(account.id);
    await showLoading(`Reactivating ${account.username}...`, 2000);

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/admin/users/${account.id}/reactivate`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      let errorMessage = "Failed to reactivate user";

      if (!response.ok) {
        try {
          const data = await response.json();
          errorMessage = data.error || errorMessage;
        } catch (parseErr) {
          console.error("Could not parse error response:", parseErr);
        }
        throw new Error(errorMessage);
      }

      await showSuccess(`User ${account.username} reactivated successfully`);
      fetchUsers();
    } catch (err) {
      await showError(err.message);
      console.error("Error reactivating user:", err);
    } finally {
      setDeletingUserId(null);
    }
  };

  const filterUsers = (userList) => {
    if (!searchQuery.trim()) return userList;
    return userList.filter(user =>
      user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const renderTable = (list, allowEdit = true, allowDeactivate = true, showMunicipality = false) => (
    <div className="user-table-container">
      <table className={`user-table ${showMunicipality ? "with-municipality" : ""}`}>
        <thead>
          <tr>
            <th className="avatar-col"></th>
            <th>Username</th>
            <th>Email</th>
            {showMunicipality && <th>Municipality</th>}
            <th>Status</th>
            <th>Joined Date</th>
            <th>Last Active</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {list.map((account) => (
            <tr key={account.id} className={`user-row ${!account.active ? "deactivated" : ""}`}>
              <td className="avatar-col">
                <span className="user-avatar">{account.username.charAt(0).toUpperCase()}</span>
              </td>
              <td>{account.username}</td>
              <td>{account.email}</td>
              {showMunicipality && <td>{account.municipality || "—"}</td>}
              <td>
                <span className={`status-badge ${account.verified ? "verified" : "unverified"} ${!account.active ? "deactivated" : ""}`}>
                  {!account.active ? "Deactivated" : (account.verified ? "Verified" : "Unverified")}
                </span>
              </td>
              <td>{formatJoinedDate(account.created_at)}</td>
              <td>{formatRelativeTime(account.last_login)}</td>
              <td>
                <div className="action-icons">
                  {allowEdit && (
                    <button
                      type="button"
                      className="icon-action-btn icon-edit-btn"
                      onClick={() => handleEdit(account)}
                      disabled={deletingUserId !== null}
                      title="Edit account"
                      aria-label="Edit account"
                    >
                      <img src="/edit.png" alt="" className="icon-action-img" />
                    </button>
                  )}
                  {allowDeactivate && (
                    <StatusToggle
                      active={account.active}
                      onToggle={() => (account.active ? handleDeactivate(account) : handleReactivate(account))}
                      disabled={deletingUserId !== null}
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const filteredSuperadmins = filterUsers(superadmins);
  const filteredAdmins = filterUsers(admins);
  const filteredMunicipalAccounts = filterUsers(municipalAccounts);

  return (
    <AdminLayout>
      {Tour}
      <TourInfoButton onClick={replay} />
      <div className="user-management-container">
        <div className="user-management-header">
          <div>
            <h1>User Management</h1>
            <p>Manage all accounts in one place. Review requests, assign roles, and control access.</p>
          </div>
          {isSuperadmin && (
            <button className="add-admin-btn" onClick={handleAddAdmin}>
              <img src="/add-admin.png" alt="Add Admin" className="btn-icon" />
              Add Account
            </button>
          )}
        </div>

        {error && (
          <div className="user-management-error">
            {error}
          </div>
        )}

        <div className="search-bar-wrapper">
          <img src="/search-bar.png" alt="Search" className="search-icon" />
          <input
            type="text"
            className="search-bar"
            placeholder="Search by username or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Pending Account Requests Section — municipal-account signups awaiting review */}
        <div className="user-section">
          <h2 className="section-title">Pending Account Requests</h2>
          {requestsLoading ? (
            <p className="user-management-loading">Loading requests...</p>
          ) : pendingRequests.length === 0 ? (
            <p className="user-management-empty">No pending account requests.</p>
          ) : (
            <div className="user-table-container">
              <table className="user-table pending-requests">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Municipality</th>
                    <th>Contact Number</th>
                    <th>Position</th>
                    <th>Request Letter</th>
                    <th>Requested</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRequests.map((request) => (
                    <tr key={request.id} className="user-row">
                      <td>{request.username}</td>
                      <td>{request.email}</td>
                      <td>{request.municipality}</td>
                      <td>{request.contact_number}</td>
                      <td>{request.position}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-view-letter-link"
                          onClick={() => handleViewLetter(request.id)}
                        >
                          View Letter
                        </button>
                      </td>
                      <td>{new Date(request.requested_at).toLocaleDateString()}</td>
                      <td>
                        <div className="action-icons">
                          <button
                            type="button"
                            className="icon-action-btn"
                            onClick={() => handleApproveRequest(request)}
                            title="Approve request"
                            aria-label="Approve request"
                          >
                            <img src="/approve.png" alt="" className="icon-action-img" />
                          </button>
                          <button
                            type="button"
                            className="icon-action-btn"
                            onClick={() => handleRejectRequest(request)}
                            title="Reject request"
                            aria-label="Reject request"
                          >
                            <img src="/reject.png" alt="" className="icon-action-img" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {loading ? (
          <p className="user-management-loading">Loading users...</p>
        ) : (
          <>
            {/* Superadmin Accounts Section — visible only to superadmins */}
            {isSuperadmin && (
              <div className="user-section">
                <h2 className="section-title">Superadmin Accounts</h2>
                {filteredSuperadmins.length === 0 ? (
                  <p className="user-management-empty">No superadmin accounts found.</p>
                ) : (
                  renderTable(filteredSuperadmins, true, true)
                )}
              </div>
            )}

            {/* Admin Accounts Section */}
            <div className="user-section">
              <h2 className="section-title">Admin Accounts</h2>
              {filteredAdmins.length === 0 ? (
                <p className="user-management-empty">No admin accounts found.</p>
              ) : (
                renderTable(filteredAdmins, true, true)
              )}
            </div>

            {/* Municipal Accounts Section */}
            <div className="user-section">
              <h2 className="section-title">Municipal Accounts</h2>
              {filteredMunicipalAccounts.length === 0 ? (
                <p className="user-management-empty">No municipal accounts found.</p>
              ) : (
                renderTable(filteredMunicipalAccounts, true, true, true)
              )}
            </div>
          </>
        )}
      </div>

      <AddAccountModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          fetchUsers();
          setShowAddModal(false);
        }}
        onError={() => {
          setTimeout(() => setShowAddModal(true), 100);
        }}
      />

      <EditAccountModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingAccount(null);
        }}
        account={editingAccount}
        onSuccess={() => {
          fetchUsers();
          setShowEditModal(false);
          setEditingAccount(null);
        }}
      />

      <ApproveRequestModal
        isOpen={showApproveModal}
        request={approvingRequest}
        onClose={() => {
          setShowApproveModal(false);
          setApprovingRequest(null);
        }}
        onSuccess={() => {
          setShowApproveModal(false);
          setApprovingRequest(null);
          fetchAccountRequests();
          fetchUsers();
        }}
      />

      <RejectRequestModal
        isOpen={showRejectModal}
        request={rejectingRequest}
        onClose={() => {
          setShowRejectModal(false);
          setRejectingRequest(null);
        }}
        onSuccess={() => {
          setShowRejectModal(false);
          setRejectingRequest(null);
          fetchAccountRequests();
        }}
      />
    </AdminLayout>
  );
}
