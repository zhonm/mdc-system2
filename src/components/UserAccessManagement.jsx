import React, { useState } from 'react';
import { useApp, ALL_PAGES } from '../context/AppContext';
import {
  ShieldCheck,
  UserPlus,
  CheckCircle2,
  XCircle,
  UserX,
  UserCheck,
  Pencil,
  Trash2,
  X,
  Mail,
  User,
  MapPin,
  Shield,
  AlertTriangle
} from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'warehouse_staff', label: 'Warehouse Staff' },
  { value: 'admin', label: 'Admin' },
  { value: 'site_staff', label: 'Site Staff (Branch)' },
  { value: 'management_viewer', label: 'Management / Viewer' },
  { value: 'superadmin', label: 'Superadmin' }
];

const emptyForm = {
  fullName: '',
  email: '',
  role: 'warehouse_staff',
  siteId: 'site-dc'
};

export default function UserAccessManagement() {
  const {
    usersList,
    sites,
    provisionUser,
    updateUser,
    deleteUser,
    toggleUserPagePermission,
    applyRolePresetToUser,
    toggleUserActiveStatus,
    currentUser,
    showToast
  } = useApp();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const matrixPages = ALL_PAGES.filter(p => p.id !== 'user-access');

  const openAddModal = () => {
    setForm(emptyForm);
    setShowAddModal(true);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setForm({
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      siteId: user.siteId || 'site-dc'
    });
  };

  const closeModals = () => {
    setShowAddModal(false);
    setEditingUser(null);
    setDeletingUser(null);
    setForm(emptyForm);
  };

  const handleCreateUser = (e) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.email.trim()) {
      showToast('Please provide full name and company email', 'error');
      return;
    }

    const res = provisionUser({
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      role: form.role,
      siteId: form.siteId
    });

    if (res.success) {
      closeModals();
    }
  };

  const handleUpdateUser = (e) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.email.trim()) {
      showToast('Please provide full name and company email', 'error');
      return;
    }

    if (updateUser) {
      const res = updateUser(editingUser.id, {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        role: form.role,
        siteId: form.siteId
      });
      if (res && res.success !== false) {
        closeModals();
      }
    } else {
      closeModals();
    }
  };

  const handleDeleteUser = () => {
    if (!deletingUser) return;
    if (deleteUser) {
      const res = deleteUser(deletingUser.id);
      if (res && res.success !== false) {
        closeModals();
      }
    } else {
      closeModals();
    }
  };

  const renderUserModal = (isEdit = false) => {
    const isRoleChanged = isEdit && editingUser && form.role !== editingUser.role;

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px',
          animation: 'fadeIn 0.15s ease-out'
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModals();
        }}
      >
        <div
          className="card"
          style={{
            maxWidth: '560px',
            width: '100%',
            background: 'var(--bg-surface)',
            borderRadius: '12px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
            border: '1px solid var(--border-light)',
            padding: '24px 28px',
            overflow: 'hidden'
          }}
        >
          {/* Modal Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '20px',
              paddingBottom: '14px',
              borderBottom: '1px solid var(--border-light)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: 'var(--primary-light)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {isEdit ? <Pencil size={18} /> : <UserPlus size={18} />}
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600, color: 'var(--text-main)' }}>
                  {isEdit ? 'Edit User Account' : 'Provision New User'}
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                  {isEdit
                    ? 'Update profile details, security role, and assigned branch location.'
                    : 'Add a new staff member and configure their starting permissions.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={closeModals}
              style={{
                background: 'transparent',
                border: 'none',
                width: '30px',
                height: '30px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                transition: 'all 0.15s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#f1f5f9';
                e.currentTarget.style.color = '#0f172a';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Modal Form */}
          <form onSubmit={isEdit ? handleUpdateUser : handleCreateUser}>
            {/* Full Name */}
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <User size={13} />
                <span>Full Name</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Maria Santos"
                value={form.fullName}
                onChange={(e) => setForm(prev => ({ ...prev, fullName: e.target.value }))}
                required
                autoFocus
              />
            </div>

            {/* Company Email */}
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Mail size={13} />
                <span>Company Email</span>
              </label>
              <input
                type="email"
                className="form-input"
                placeholder="e.g. maria.santos@mobilecare.com.ph"
                value={form.email}
                onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                required
              />
            </div>

            {/* 2-Column Grid for Role & Location */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                gap: '14px',
                marginBottom: '18px'
              }}
            >
              <div className="form-group" style={{ minWidth: 0, marginBottom: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shield size={13} />
                  <span>Role & Permissions</span>
                </label>
                <select
                  className="form-select"
                  value={form.role}
                  onChange={(e) => setForm(prev => ({ ...prev, role: e.target.value }))}
                >
                  {ROLE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ minWidth: 0, marginBottom: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={13} />
                  <span>Assigned Location</span>
                </label>
                <select
                  className="form-select"
                  value={form.siteId}
                  onChange={(e) => setForm(prev => ({ ...prev, siteId: e.target.value }))}
                >
                  {sites.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.code} - {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Info or Warning Box */}
            {!isEdit && (
              <div
                style={{
                  background: '#f8fafc',
                  padding: '11px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  marginBottom: '20px',
                  border: '1px solid var(--border-light)',
                  lineHeight: 1.4
                }}
              >
                ℹ️ The user will be provisioned with <code>has_set_password = false</code>. On first login, they will configure their password before accessing the system.
              </div>
            )}

            {isRoleChanged && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: '#fffbeb',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  color: '#92400e',
                  marginBottom: '20px',
                  border: '1px solid #fde68a'
                }}
              >
                <AlertTriangle size={15} color="#d97706" style={{ flexShrink: 0 }} />
                <span>Changing the role will reset the user's page permissions to the new role default template.</span>
              </div>
            )}

            {/* Action Buttons */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: '10px',
                paddingTop: '12px',
                borderTop: '1px solid var(--border-light)'
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeModals}
                style={{ minWidth: '90px' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ minWidth: '120px' }}
              >
                {isEdit ? 'Save Changes' : 'Provision User'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="user-access-view" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Top Banner */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={22} color="var(--primary)" />
              <h2 style={{ fontSize: '18px', margin: 0 }}>User Provisioning & Page Access Control</h2>
            </div>
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Superadmin Portal • Add, edit, and delete staff accounts, manage first-time setup state, and fine-grained per-page access permissions.
            </p>
          </div>

          <button className="btn btn-primary" onClick={openAddModal}>
            <UserPlus size={16} />
            <span>Provision New User</span>
          </button>
        </div>
      </div>

      {/* Access Matrix Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: '#f8fafc', zIndex: 10, minWidth: '220px' }}>
                  User & Role
                </th>
                <th style={{ textAlign: 'center' }}>Account Status</th>
                <th style={{ textAlign: 'center' }}>Password Set</th>
                {matrixPages.map(page => (
                  <th key={page.id} style={{ textAlign: 'center', fontSize: '11px', whiteSpace: 'nowrap', padding: '10px 8px' }}>
                    {page.label}
                  </th>
                ))}
                <th style={{ textAlign: 'center' }}>Role Presets</th>
                <th style={{ textAlign: 'center', minWidth: '180px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersList.map(user => {
                const isSuperadmin = user.role === 'superadmin';
                const isSelf = user.id === currentUser?.id;

                return (
                  <tr key={user.id} style={{ opacity: user.isActive ? 1 : 0.6 }}>
                    {/* User info sticky column */}
                    <td style={{ position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: 'var(--radius-full)',
                            background: isSuperadmin ? 'var(--primary-light)' : '#e2e8f0',
                            color: isSuperadmin ? 'var(--primary)' : 'var(--text-main)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '12px'
                          }}
                        >
                          {user.fullName.charAt(0)}
                        </div>
                        <div>
                          <strong style={{ fontSize: '13px' }}>{user.fullName}</strong>
                          {isSelf && <span style={{ fontSize: '10px', color: 'var(--primary)', marginLeft: '4px' }}>(You)</span>}
                          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{user.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Active Status */}
                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${user.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {user.isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </td>

                    {/* Password Configured */}
                    <td style={{ textAlign: 'center' }}>
                      {user.hasSetPassword ? (
                        <span className="badge badge-neutral" style={{ color: 'var(--success-dark)', background: 'var(--success-light)' }}>
                          <CheckCircle2 size={12} /> Configured
                        </span>
                      ) : (
                        <span className="badge badge-warning">
                          Pending 1st Login
                        </span>
                      )}
                    </td>

                    {/* 10 Page Permission Toggles */}
                    {matrixPages.map(page => {
                      const isGranted = isSuperadmin || (user.permittedPages?.includes(page.id) ?? false);

                      return (
                        <td key={page.id} style={{ textAlign: 'center', padding: '6px 4px' }}>
                          <button
                            type="button"
                            disabled={isSuperadmin}
                            onClick={() => toggleUserPagePermission(user.id, page.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: isSuperadmin ? 'default' : 'pointer',
                              padding: '2px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            title={`${isGranted ? 'Revoke' : 'Grant'} access to ${page.label}`}
                          >
                            {isGranted ? (
                              <CheckCircle2 size={18} color={isSuperadmin ? '#94a3b8' : 'var(--primary)'} />
                            ) : (
                              <XCircle size={18} color="#cbd5e1" />
                            )}
                          </button>
                        </td>
                      );
                    })}

                    {/* Quick Presets */}
                    <td style={{ textAlign: 'center' }}>
                      {!isSuperadmin && (
                        <select
                          className="form-select"
                          style={{ fontSize: '11px', padding: '3px 6px', height: '28px' }}
                          value={user.role}
                          onChange={(e) => applyRolePresetToUser(user.id, e.target.value)}
                        >
                          <option value="warehouse_staff">Warehouse Staff Preset</option>
                          <option value="admin">Admin Preset</option>
                          <option value="site_staff">Site Staff Preset</option>
                          <option value="management_viewer">Viewer Preset</option>
                        </select>
                      )}
                      {isSuperadmin && (
                        <span className="badge badge-primary">Full Access</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-sm btn-secondary"
                          style={{ fontSize: '11px', padding: '3px 8px' }}
                          onClick={() => openEditModal(user)}
                          title="Edit user"
                        >
                          <Pencil size={12} />
                          <span>Edit</span>
                        </button>

                        {!isSelf && (
                          <>
                            <button
                              className={`btn btn-sm ${user.isActive ? 'btn-secondary' : 'btn-primary'}`}
                              style={{ fontSize: '11px', padding: '3px 8px' }}
                              onClick={() => toggleUserActiveStatus(user.id)}
                              title={user.isActive ? 'Deactivate user' : 'Reactivate user'}
                            >
                              {user.isActive ? <UserX size={12} /> : <UserCheck size={12} />}
                              <span>{user.isActive ? 'Deactivate' : 'Reactivate'}</span>
                            </button>

                            <button
                              className="btn btn-sm btn-danger"
                              style={{ fontSize: '11px', padding: '3px 8px' }}
                              onClick={() => setDeletingUser(user)}
                              title="Delete user"
                            >
                              <Trash2 size={12} />
                              <span>Delete</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Provision User Modal */}
      {showAddModal && renderUserModal(false)}

      {/* Edit User Modal */}
      {editingUser && renderUserModal(true)}

      {/* Delete Confirmation Modal */}
      {deletingUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModals();
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '460px',
              width: '100%',
              background: 'var(--bg-surface)',
              borderRadius: '12px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid var(--border-light)',
              padding: '24px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: 'var(--danger-light)',
                  color: 'var(--danger)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Trash2 size={18} />
              </div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600 }}>Delete User Account</h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete <strong>{deletingUser.fullName}</strong> ({deletingUser.email})? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-secondary" onClick={closeModals}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDeleteUser}>
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
