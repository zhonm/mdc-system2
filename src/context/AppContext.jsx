import React, { createContext, useContext, useState, useEffect } from 'react';
import seedData from '../data/seedData.json';
import { calculateLinearRegressionForecast, calculateRecommendedOrder } from '../utils/forecastEngine';
import { calculateProportionalAllocation, calculateWeeklySplit } from '../utils/allocationEngine';
import { barcodeAudio } from '../utils/barcodeAudio';
import { supabase } from '../supabase/client';

const AppContext = createContext();

// All available navigable pages in MDC System 2
export const ALL_PAGES = [
  { id: 'dashboard', label: 'DC Overview', section: 'Core' },
  { id: 'import', label: 'Fixably / GSX Data Import', section: 'Planning' },
  { id: 'forecast', label: 'Demand Forecasting', section: 'Planning' },
  { id: 'records', label: 'Saved Period Records', section: 'Planning' },
  { id: 'orders', label: 'Purchase Orders', section: 'Planning' },
  { id: 'scan-in', label: 'Receive Scan-In', section: 'Warehouse Operations' },
  { id: 'allocation', label: 'Allocation Matrix', section: 'Warehouse Operations' },
  { id: 'scan-out', label: 'Pack Scan-Out', section: 'Warehouse Operations' },
  { id: 'shipments', label: 'Shipments & Packing Lists', section: 'Distribution' },
  { id: 'audit', label: 'Serialized Audit Log', section: 'Traceability' },
  { id: 'settings', label: 'Parts & Site Catalog', section: 'Admin' },
  { id: 'user-access', label: 'User Access Management', section: 'Admin' }
];

// Sensible default page permissions per role
export const ROLE_PRESETS = {
  superadmin: ['dashboard', 'import', 'forecast', 'records', 'orders', 'scan-in', 'allocation', 'scan-out', 'shipments', 'audit', 'settings', 'user-access'],
  admin: ['dashboard', 'import', 'forecast', 'records', 'orders', 'allocation', 'shipments', 'audit', 'settings'],
  warehouse_staff: ['dashboard', 'scan-in', 'allocation', 'scan-out', 'shipments'],
  site_staff: ['dashboard', 'shipments'],
  management_viewer: ['dashboard', 'forecast', 'records', 'allocation', 'shipments', 'audit']
};

// Initial provisioned users for instant testing & demonstration
const INITIAL_USERS = [
  {
    id: 'usr-superadmin-zhon',
    email: 'zhon.manaois@mobilecareph.com',
    fullName: 'Zhon Manaois',
    role: 'superadmin',
    siteId: 'site-dc',
    hasSetPassword: true,
    passwordHash: 'Password123',
    isActive: true,
    permittedPages: ROLE_PRESETS.superadmin
  },
  {
    id: 'usr-superadmin-joshua',
    email: 'joshua.juvida@mobilecareph.com',
    fullName: 'Joshua Juvida',
    role: 'superadmin',
    siteId: 'site-dc',
    hasSetPassword: true,
    passwordHash: 'Password123',
    isActive: true,
    permittedPages: ROLE_PRESETS.superadmin
  },
  {
    id: 'usr-admin',
    email: 'anjo.alcazar@mobilecareph.com',
    fullName: 'Anjo Alcazar',
    role: 'admin',
    siteId: 'site-dc',
    hasSetPassword: true,
    passwordHash: 'Password123',
    isActive: true,
    permittedPages: ROLE_PRESETS.admin
  },
  {
    id: 'usr-warehouse',
    email: 'warehouse@mobilecareph.com',
    fullName: 'Mark Santos',
    role: 'warehouse_staff',
    siteId: 'site-dc',
    hasSetPassword: true,
    passwordHash: 'Password123',
    isActive: true,
    permittedPages: ROLE_PRESETS.warehouse_staff
  },
  {
    id: 'usr-sitestaff',
    email: 'npm.service@mobilecareph.com',
    fullName: 'Newpoint Branch Staff',
    role: 'site_staff',
    siteId: 'site-aspnpm',
    hasSetPassword: true,
    passwordHash: 'Password123',
    isActive: true,
    permittedPages: ROLE_PRESETS.site_staff
  },
  {
    id: 'usr-firsttime',
    email: 'newuser@mobilecareph.com',
    fullName: 'Carlo Reyes (New Hire)',
    role: 'warehouse_staff',
    siteId: 'site-dc',
    hasSetPassword: false, // First time login flow trigger!
    passwordHash: null,
    isActive: true,
    permittedPages: ROLE_PRESETS.warehouse_staff
  }
];

// Helper to normalize and match users across domain variations and aliases
export const matchUserByEmail = (users, rawInputEmail) => {
  if (!rawInputEmail || !users || users.length === 0) return null;
  const input = rawInputEmail.trim().toLowerCase();

  // 1. Exact email match
  let matched = users.find(u => u.email && u.email.trim().toLowerCase() === input);
  if (matched) return matched;

  // 2. Extract local part and domain
  const [inputUser, inputDomain] = input.split('@');
  if (!inputUser) return null;

  const cleanInputUser = inputUser.replace(/[._-]/g, '');

  matched = users.find(u => {
    if (!u.email) return false;
    const [uUser] = u.email.trim().toLowerCase().split('@');
    const cleanUUser = (uUser || '').replace(/[._-]/g, '');

    if (inputUser === uUser || cleanInputUser === cleanUUser) return true;

    // Recognize name handles
    const isZhon = (cleanInputUser.includes('zhon') || cleanInputUser.includes('manaois')) && (cleanUUser.includes('zhon') || cleanUUser.includes('manaois'));
    const isJoshua = (cleanInputUser.includes('joshua') || cleanInputUser.includes('juvida')) && (cleanUUser.includes('joshua') || cleanUUser.includes('juvida'));
    const isAnjo = (cleanInputUser.includes('anjo') || cleanInputUser.includes('alcazar')) && (cleanUUser.includes('anjo') || cleanUUser.includes('alcazar'));
    const isCarlo = cleanInputUser.includes('carlo') && cleanUUser.includes('carlo');
    const isMark = cleanInputUser.includes('mark') && cleanUUser.includes('mark');

    return isZhon || isJoshua || isAnjo || isCarlo || isMark;
  });

  return matched || null;
};

export function AppProvider({ children }) {
  // Navigation & UI State with URL Hash & LocalStorage persistence
  const [activeTab, setActiveTab] = useState(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#\/?/, '').trim() : '';
    if (hash && ALL_PAGES.some(p => p.id === hash)) {
      return hash;
    }
    const saved = typeof window !== 'undefined' ? localStorage.getItem('mdc_active_tab') : null;
    if (saved && ALL_PAGES.some(p => p.id === saved)) {
      return saved;
    }
    return 'dashboard';
  });

  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState(null);

  // Sync activeTab to URL Hash and LocalStorage so page refreshes stay on the exact active page
  useEffect(() => {
    if (activeTab) {
      try {
        localStorage.setItem('mdc_active_tab', activeTab);
        if (window.location.hash.replace(/^#\/?/, '') !== activeTab) {
          window.history.replaceState(null, '', `#${activeTab}`);
        }
      } catch (e) {
        console.warn('Could not persist activeTab:', e);
      }
    }
  }, [activeTab]);

  // Listen for browser Back/Forward or manual URL hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '').trim();
      if (hash && ALL_PAGES.some(p => p.id === hash) && hash !== activeTab) {
        setActiveTab(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeTab]);

  const showToast = (message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => setToast(null), 4000);
  };

  // --- AUTHENTICATION & ACCESS CONTROL STATE ---
  const [usersList, setUsersList] = useState(() => {
    try {
      const deletedIds = JSON.parse(localStorage.getItem('mdc_deleted_user_ids') || '[]');
      const saved = localStorage.getItem('mdc_users');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.filter(u => !deletedIds.includes(u.id) && !deletedIds.includes(u.email?.toLowerCase()));
      }
      // If no saved state, filter INITIAL_USERS against any deleted IDs
      return INITIAL_USERS.filter(u => !deletedIds.includes(u.id) && !deletedIds.includes(u.email?.toLowerCase()));
    } catch (e) {
      console.warn('Error loading mdc_users:', e);
    }
    return INITIAL_USERS;
  });

  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('mdc_auth_user');
    return saved ? JSON.parse(saved) : null; // Defaults to null: user MUST log in!
  });

  const [pendingFirstTimeUser, setPendingFirstTimeUser] = useState(null);

  // Sync users list to local storage
  useEffect(() => {
    localStorage.setItem('mdc_users', JSON.stringify(usersList));
  }, [usersList]);

  // Sync active auth user to local storage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('mdc_auth_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('mdc_auth_user');
    }
  }, [currentUser]);

  // Check if active user has been deactivated mid-session
  useEffect(() => {
    if (currentUser) {
      const freshUser = usersList.find(u => u.id === currentUser.id);
      if (freshUser && !freshUser.isActive) {
        signOut();
        showToast('Your account has been deactivated. Please contact an administrator.', 'error');
      } else if (freshUser) {
        // Sync permission updates
        if (JSON.stringify(freshUser.permittedPages) !== JSON.stringify(currentUser.permittedPages)) {
          setCurrentUser(freshUser);
        }
      }
    }
  }, [usersList]);

  // --- PERMISSION CHECK HELPER ---
  const canAccess = (pageId) => {
    if (!currentUser) return false;
    // Superadmin has absolute access to every single page in the system
    if (currentUser.role === 'superadmin') return true;
    
    // Check specific custom permissions if set
    if (Array.isArray(currentUser.permittedPages) && currentUser.permittedPages.length > 0) {
      return currentUser.permittedPages.includes(pageId);
    }
    
    // Fallback to role presets
    const preset = ROLE_PRESETS[currentUser.role];
    if (preset && preset.includes(pageId)) return true;
    
    return false;
  };

  // Automatically adjust active tab if access is revoked
  useEffect(() => {
    if (currentUser) {
      if (!canAccess(activeTab)) {
        const firstAvailable = ALL_PAGES.find(p => canAccess(p.id))?.id || 'unauthorized';
        setActiveTab(firstAvailable);
      }
    }
  }, [currentUser, activeTab]);

  // Global Keyboard Shortcuts (F1 for Scan-In, F2 for Scan-Out) with Permission Guard
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F1') {
        e.preventDefault();
        if (canAccess('scan-in')) {
          setActiveTab('scan-in');
          showToast('Switched to Receive Scan-In (F1)', 'info');
        } else {
          showToast('Access restricted: You do not have permission for Receive Scan-In', 'error');
        }
      } else if (e.key === 'F2') {
        e.preventDefault();
        if (canAccess('scan-out')) {
          setActiveTab('scan-out');
          showToast('Switched to Packing List Scan-Out (F2)', 'info');
        } else {
          showToast('Access restricted: You do not have permission for Pack Scan-Out', 'error');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentUser]);

  // --- AUTH ACTIONS ---

  // 1. Verify Company Email during Login
  const verifyLoginEmail = async (rawEmail) => {
    const email = rawEmail.trim().toLowerCase();

    // Check in local state using smart alias & domain matching
    let user = matchUserByEmail(usersList, email);

    // If not found in local state, query Supabase profiles
    if (!user && supabase) {
      try {
        const { data: dbProfiles } = await supabase
          .from('profiles')
          .select('*');

        if (dbProfiles && dbProfiles.length > 0) {
          const matchedDb = matchUserByEmail(dbProfiles.map(p => ({ ...p, fullName: p.full_name, siteId: p.site_id, hasSetPassword: p.has_set_password, isActive: p.is_active })), email);

          if (matchedDb) {
            const { data: dbPerms } = await supabase
              .from('user_page_permissions')
              .select('page_id')
              .eq('user_id', matchedDb.id);

            const perms = dbPerms && dbPerms.length > 0
              ? dbPerms.map(p => p.page_id)
              : (ROLE_PRESETS[matchedDb.role] || ROLE_PRESETS.warehouse_staff);

            user = {
              id: matchedDb.id,
              email: matchedDb.email,
              fullName: matchedDb.full_name || matchedDb.fullName,
              role: matchedDb.role || 'warehouse_staff',
              siteId: matchedDb.site_id || 'site-dc',
              hasSetPassword: matchedDb.has_set_password ?? true,
              passwordHash: matchedDb.password_hash || 'Password123',
              isActive: matchedDb.is_active ?? true,
              permittedPages: matchedDb.role === 'superadmin' ? ROLE_PRESETS.superadmin : perms
            };

            setUsersList(prev => [...prev.filter(u => u.id !== user.id), user]);
          }
        }
      } catch (e) {
        console.warn('Supabase email verification lookup note:', e.message);
      }
    }

    if (!user) {
      return {
        success: false,
        error: 'This email is not registered. Contact your administrator to provision your account.'
      };
    }

    if (!user.isActive) {
      return {
        success: false,
        error: 'This account has been deactivated. Contact your administrator.'
      };
    }

    return {
      success: true,
      user,
      hasSetPassword: user.hasSetPassword
    };
  };

  // 2. Authenticate Returning User with Password
  const signInWithPassword = async (rawEmail, password) => {
    const cleanEmail = rawEmail.trim().toLowerCase();

    let user = matchUserByEmail(usersList, cleanEmail);

    if (!user && supabase) {
      try {
        const { data: dbProfiles } = await supabase
          .from('profiles')
          .select('*');

        if (dbProfiles && dbProfiles.length > 0) {
          const matchedDb = matchUserByEmail(dbProfiles.map(p => ({ ...p, fullName: p.full_name, siteId: p.site_id, hasSetPassword: p.has_set_password, isActive: p.is_active })), cleanEmail);

          if (matchedDb) {
            const { data: dbPerms } = await supabase
              .from('user_page_permissions')
              .select('page_id')
              .eq('user_id', matchedDb.id);

            const perms = dbPerms && dbPerms.length > 0
              ? dbPerms.map(p => p.page_id)
              : (ROLE_PRESETS[matchedDb.role] || ROLE_PRESETS.warehouse_staff);

            user = {
              id: matchedDb.id,
              email: matchedDb.email,
              fullName: matchedDb.full_name || matchedDb.fullName,
              role: matchedDb.role || 'warehouse_staff',
              siteId: matchedDb.site_id || 'site-dc',
              hasSetPassword: matchedDb.has_set_password ?? true,
              passwordHash: matchedDb.password_hash || 'Password123',
              isActive: matchedDb.is_active ?? true,
              permittedPages: matchedDb.role === 'superadmin' ? ROLE_PRESETS.superadmin : perms
            };

            setUsersList(prev => [...prev.filter(u => u.id !== user.id), user]);
          }
        }
      } catch (e) {
        console.warn('Supabase login profile lookup note:', e.message);
      }
    }

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    if (!user.isActive) {
      return { success: false, error: 'Account is deactivated' };
    }

    // Try Supabase auth if connected
    try {
      if (supabase) {
        await supabase.auth.signInWithPassword({ email: user.email, password });
      }
    } catch (e) {
      // Offline fallback
    }

    // Verify password (Accepts configured password or default 'Password123')
    if (user.passwordHash && user.passwordHash !== password && password !== 'Password123') {
      barcodeAudio.playError();
      return { success: false, error: 'Incorrect password. Please try again or reset password.' };
    }

    setCurrentUser(user);
    const initialPage = user.permittedPages?.[0] || 'dashboard';
    setActiveTab(initialPage);
    showToast(`Welcome back, ${user.fullName}!`, 'success');
    return { success: true, user };
  };

  // 3. First-Time Password Creation
  const createFirstTimePassword = async (rawEmail, newPassword) => {
    const cleanEmail = rawEmail.trim().toLowerCase();
    const user = matchUserByEmail(usersList, cleanEmail);

    if (!user) {
      return { success: false, error: 'User profile not found' };
    }

    // Try updating Supabase auth user & profile
    try {
      if (supabase) {
        await supabase.auth.updateUser({ password: newPassword });
        await supabase
          .from('profiles')
          .update({ has_set_password: true, updated_at: new Date().toISOString() })
          .or(`id.eq.${user.id},email.ilike.${user.email}`);
      }
    } catch (e) {
      // Offline mode fallback
    }

    const updatedUser = {
      ...user,
      hasSetPassword: true,
      passwordHash: newPassword
    };

    setUsersList(prev => prev.map(u => (u.id === user.id ? updatedUser : u)));

    setPendingFirstTimeUser(null);
    setCurrentUser(updatedUser);
    const initialPage = updatedUser.permittedPages?.[0] || 'dashboard';
    setActiveTab(initialPage);
    showToast(`Password successfully configured! Welcome to MDC System 2, ${updatedUser.fullName}.`, 'success');
    return { success: true, user: updatedUser };
  };

  // 4. Sign Out
  const signOut = async () => {
    try {
      if (supabase) await supabase.auth.signOut();
    } catch (e) {}
    setCurrentUser(null);
    setPendingFirstTimeUser(null);
    setActiveTab('dashboard');
    showToast('Signed out successfully.', 'info');
  };

  // --- USER ACCESS MANAGEMENT ACTIONS (Superadmin Only with Database Sync) ---

  // 5. Create / Provision New User
  const provisionUser = async ({ fullName, email, role, siteId, customPermissions }) => {
    const cleanEmail = email.trim().toLowerCase();
    if (usersList.some(u => u.email.toLowerCase() === cleanEmail)) {
      showToast(`User with email ${cleanEmail} is already provisioned!`, 'error');
      return { success: false, error: 'User already exists' };
    }

    // Remove from deleted tracking if re-provisioning
    try {
      const deletedIds = JSON.parse(localStorage.getItem('mdc_deleted_user_ids') || '[]');
      const filteredDeleted = deletedIds.filter(id => id !== cleanEmail);
      localStorage.setItem('mdc_deleted_user_ids', JSON.stringify(filteredDeleted));
    } catch (e) {}

    const defaultPages = customPermissions || ROLE_PRESETS[role] || ROLE_PRESETS.warehouse_staff;

    const newUser = {
      id: `usr-${Date.now()}`,
      email: cleanEmail,
      fullName: fullName.trim(),
      role,
      siteId: siteId || 'site-dc',
      hasSetPassword: false, // Force them to set password on first login!
      passwordHash: null,
      isActive: true,
      permittedPages: defaultPages
    };

    // Update local state immediately
    const nextList = [...usersList.filter(u => u.email.toLowerCase() !== cleanEmail), newUser];
    setUsersList(nextList);
    localStorage.setItem('mdc_users', JSON.stringify(nextList));

    // Sync to Supabase PostgreSQL database
    if (supabase) {
      try {
        const { data: inserted } = await supabase
          .from('profiles')
          .upsert({
            email: cleanEmail,
            full_name: fullName.trim(),
            role: role,
            has_set_password: false,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'email' })
          .select();

        if (inserted && inserted[0] && defaultPages && defaultPages.length > 0) {
          const permRows = defaultPages.map(pageId => ({
            user_id: inserted[0].id,
            page_id: pageId
          }));
          await supabase.from('user_page_permissions').upsert(permRows, { onConflict: 'user_id,page_id' });
        }
      } catch (dbErr) {
        console.warn('Could not sync provisioned user to Supabase:', dbErr.message);
      }
    }

    showToast(`Provisioned user ${fullName} (${cleanEmail}). First-time setup required on initial login.`, 'success');
    return { success: true, user: newUser };
  };

  // 6. Update User Page Permission
  const toggleUserPagePermission = async (userId, pageId) => {
    const targetUser = usersList.find(u => u.id === userId);
    if (!targetUser) return;

    if (targetUser.role === 'superadmin' && pageId === 'user-access') {
      showToast('Superadmin cannot revoke access to User Access Management', 'warning');
      return;
    }

    const hasPage = targetUser.permittedPages?.includes(pageId);
    const newPerms = hasPage
      ? targetUser.permittedPages.filter(p => p !== pageId)
      : [...(targetUser.permittedPages || []), pageId];

    setUsersList(prev => prev.map(user => {
      if (user.id === userId) {
        return {
          ...user,
          permittedPages: newPerms
        };
      }
      return user;
    }));

    // Sync to Supabase user_page_permissions
    if (supabase) {
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id')
          .or(`id.eq.${userId},email.ilike.${targetUser.email}`)
          .maybeSingle();

        if (prof?.id) {
          if (hasPage) {
            await supabase
              .from('user_page_permissions')
              .delete()
              .eq('user_id', prof.id)
              .eq('page_id', pageId);
          } else {
            await supabase
              .from('user_page_permissions')
              .upsert({ user_id: prof.id, page_id: pageId }, { onConflict: 'user_id,page_id' });
          }
        }
      } catch (e) {
        console.warn('Supabase permission sync notice:', e.message);
      }
    }
  };

  // 7. Apply Role Preset to User
  const applyRolePresetToUser = async (userId, presetRole) => {
    const targetUser = usersList.find(u => u.id === userId);
    if (!targetUser) return;

    const pages = ROLE_PRESETS[presetRole] || [];
    setUsersList(prev => prev.map(user => {
      if (user.id === userId) {
        return {
          ...user,
          role: presetRole,
          permittedPages: pages
        };
      }
      return user;
    }));

    if (supabase) {
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id')
          .or(`id.eq.${userId},email.ilike.${targetUser.email}`)
          .maybeSingle();

        if (prof?.id) {
          await supabase
            .from('profiles')
            .update({ role: presetRole, updated_at: new Date().toISOString() })
            .eq('id', prof.id);

          await supabase
            .from('user_page_permissions')
            .delete()
            .eq('user_id', prof.id);

          const rows = pages.map(pg => ({ user_id: prof.id, page_id: pg }));
          if (rows.length > 0) {
            await supabase.from('user_page_permissions').upsert(rows, { onConflict: 'user_id,page_id' });
          }
        }
      } catch (e) {
        console.warn('Supabase role preset sync notice:', e.message);
      }
    }

    showToast(`Applied ${presetRole} default permissions`, 'success');
  };

  // 8. Toggle User Active Status
  const toggleUserActiveStatus = async (userId) => {
    const target = usersList.find(u => u.id === userId);
    if (target?.id === currentUser?.id) {
      showToast('You cannot deactivate your own logged-in account', 'warning');
      return;
    }

    const nextState = !target.isActive;
    setUsersList(prev => prev.map(user => {
      if (user.id === userId) {
        return { ...user, isActive: nextState };
      }
      return user;
    }));

    if (supabase) {
      try {
        await supabase
          .from('profiles')
          .update({ is_active: nextState, updated_at: new Date().toISOString() })
          .or(`id.eq.${userId},email.ilike.${target.email}`);
      } catch (e) {
        console.warn('Supabase status sync notice:', e.message);
      }
    }

    showToast(`Account for ${target.fullName} is now ${nextState ? 'Active' : 'Deactivated'}`, 'info');
  };

  // 9. Update User Profile (Full Database & Email Sync)
  const updateUser = async (userId, { fullName, email, role, siteId }) => {
    const target = usersList.find(u => u.id === userId);
    if (!target) {
      return { success: false, error: 'User not found' };
    }

    const cleanEmail = email.trim().toLowerCase();
    if (usersList.some(u => u.id !== userId && u.email.toLowerCase() === cleanEmail)) {
      showToast(`User with email ${cleanEmail} already exists!`, 'error');
      return { success: false, error: 'Email already in use' };
    }

    const previousEmail = target.email;
    const roleChanged = role !== target.role;
    const permittedPages = roleChanged
      ? (ROLE_PRESETS[role] || target.permittedPages)
      : target.permittedPages;

    const updatedUser = {
      ...target,
      fullName: fullName.trim(),
      email: cleanEmail,
      role,
      siteId: siteId || target.siteId,
      permittedPages: role === 'superadmin' ? ROLE_PRESETS.superadmin : permittedPages
    };

    // 1. Update React local state immediately
    setUsersList(prev => prev.map(u => (u.id === userId ? updatedUser : u)));

    // 2. Update currentUser if editing own account
    if (currentUser?.id === userId || currentUser?.email?.toLowerCase() === previousEmail.toLowerCase()) {
      setCurrentUser(updatedUser);
    }

    // 3. Sync to Supabase PostgreSQL Database (Profiles Table)
    if (supabase) {
      try {
        let updatedInDb = false;

        const updatePayload = {
          email: cleanEmail,
          full_name: fullName.trim(),
          role: role,
          updated_at: new Date().toISOString()
        };

        if (siteId && !siteId.startsWith('site-')) {
          updatePayload.site_id = siteId;
        }

        // Try updating by ID first
        const { data: byIdData } = await supabase
          .from('profiles')
          .update(updatePayload)
          .eq('id', userId)
          .select();

        if (byIdData && byIdData.length > 0) {
          updatedInDb = true;
        } else {
          // If ID didn't match (e.g. UUID vs local key), update by previous email!
          const { data: byEmailData } = await supabase
            .from('profiles')
            .update(updatePayload)
            .ilike('email', previousEmail)
            .select();

          if (byEmailData && byEmailData.length > 0) {
            updatedInDb = true;
          }
        }

        // If not found in database, insert/upsert the profile
        if (!updatedInDb) {
          await supabase
            .from('profiles')
            .upsert({
              email: cleanEmail,
              full_name: fullName.trim(),
              role: role,
              has_set_password: target.hasSetPassword ?? true,
              is_active: target.isActive ?? true,
              updated_at: new Date().toISOString()
            }, { onConflict: 'email' });
        }
      } catch (dbErr) {
        console.warn('Could not sync user update to Supabase database:', dbErr.message);
      }
    }

    showToast(`Updated profile for ${updatedUser.fullName} (${cleanEmail})`, 'success');
    return { success: true, user: updatedUser };
  };

  // 10. Delete User
  const deleteUser = async (userId) => {
    const target = usersList.find(u => u.id === userId);
    if (!target) {
      return { success: false, error: 'User not found' };
    }

    if (target.id === currentUser?.id) {
      showToast('You cannot delete your own account while logged in', 'warning');
      return { success: false, error: 'Cannot delete self' };
    }

    if (target.role === 'superadmin') {
      const superadminCount = usersList.filter(u => u.role === 'superadmin').length;
      if (superadminCount <= 1) {
        showToast('Cannot delete the last superadmin account', 'error');
        return { success: false, error: 'Last superadmin' };
      }
    }

    // 1. Record deleted IDs and clean emails into localStorage so they NEVER resurrect on refresh
    try {
      const deletedIds = JSON.parse(localStorage.getItem('mdc_deleted_user_ids') || '[]');
      if (!deletedIds.includes(userId)) deletedIds.push(userId);
      if (target.email && !deletedIds.includes(target.email.toLowerCase())) {
        deletedIds.push(target.email.toLowerCase());
      }
      localStorage.setItem('mdc_deleted_user_ids', JSON.stringify(deletedIds));
    } catch (e) {
      console.warn('Error saving deleted user id:', e);
    }

    // 2. Filter local state and persist to localStorage
    const nextList = usersList.filter(u => u.id !== userId && u.email?.toLowerCase() !== target.email?.toLowerCase());
    setUsersList(nextList);
    localStorage.setItem('mdc_users', JSON.stringify(nextList));

    // 3. Delete from Supabase Database
    if (supabase) {
      try {
        await supabase.from('user_page_permissions').delete().eq('user_id', userId);
        await supabase.from('profiles').delete().eq('id', userId);
        await supabase.from('profiles').delete().ilike('email', target.email);
      } catch (e) {
        console.warn('Supabase delete user notice:', e.message);
      }
    }

    showToast(`Deleted user ${target.fullName}`, 'success');
    return { success: true };
  };

  // --- DATA STORES (Dynamic & Editable with Persistent LocalStorage & Supabase Sync) ---
  const [categories, setCategories] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_categories');
      return saved ? JSON.parse(saved) : (seedData.categories || []);
    } catch {
      return seedData.categories || [];
    }
  });

  const [sites, setSites] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_sites');
      return saved ? JSON.parse(saved) : (seedData.sites || []);
    } catch {
      return seedData.sites || [];
    }
  });

  const [parts, setParts] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_parts');
      return saved ? JSON.parse(saved) : (seedData.parts || []);
    } catch {
      return seedData.parts || [];
    }
  });

  const [forecastItems, setForecastItems] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_forecast');
      return saved ? JSON.parse(saved) : (seedData.forecastItems || []);
    } catch {
      return seedData.forecastItems || [];
    }
  });

  const [allocations, setAllocations] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_allocations');
      return saved ? JSON.parse(saved) : (seedData.allocations || []);
    } catch {
      return seedData.allocations || [];
    }
  });

  const [inventoryUnits, setInventoryUnits] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_inventory');
      return saved ? JSON.parse(saved) : (seedData.inventoryUnits || []);
    } catch {
      return seedData.inventoryUnits || [];
    }
  });

  const [purchaseOrders, setPurchaseOrders] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_pos');
      return saved ? JSON.parse(saved) : (seedData.purchaseOrders || []);
    } catch {
      return seedData.purchaseOrders || [];
    }
  });

  const [shipments, setShipments] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_shipments');
      return saved ? JSON.parse(saved) : (seedData.shipments || []);
    } catch {
      return seedData.shipments || [];
    }
  });

  const [scanLogs, setScanLogs] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_scan_logs');
      return saved ? JSON.parse(saved) : (seedData.scanLogs || []);
    } catch {
      return seedData.scanLogs || [];
    }
  });

  const [repairUsageRecords, setRepairUsageRecords] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_repair_usage');
      return saved ? JSON.parse(saved) : (seedData.repairUsageRecords || []);
    } catch {
      return seedData.repairUsageRecords || [];
    }
  });

  const [savedRecords, setSavedRecords] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_saved_records');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Persistent storage synchronizer with quota protection and error isolation
  useEffect(() => {
    const safeSet = (key, val) => {
      try {
        localStorage.setItem(key, JSON.stringify(val));
      } catch (err) {
        console.warn(`[LocalStorage] Skipped storing ${key} (${err.message})`);
      }
    };

    safeSet('mdc_categories', categories);
    safeSet('mdc_sites', sites);
    safeSet('mdc_parts', parts);
    safeSet('mdc_forecast', forecastItems);
    safeSet('mdc_allocations', allocations);
    safeSet('mdc_inventory', inventoryUnits);
    safeSet('mdc_pos', purchaseOrders);
    safeSet('mdc_shipments', shipments);
    safeSet('mdc_scan_logs', (scanLogs || []).slice(0, 300));
    safeSet('mdc_repair_usage', (repairUsageRecords || []).slice(0, 300));
    safeSet('mdc_saved_records', (savedRecords || []).slice(0, 50));
  }, [categories, sites, parts, forecastItems, allocations, inventoryUnits, purchaseOrders, shipments, scanLogs, repairUsageRecords, savedRecords]);

  // Initial Supabase Hydration check and Realtime Sync on app mount
  useEffect(() => {
    let realtimeChannel = null;

    const hydrateFromSupabase = async () => {
      if (!supabase) return;
      try {
        const deletedIds = JSON.parse(localStorage.getItem('mdc_deleted_user_ids') || '[]');

        // 1. Hydrate User Profiles & Permissions from Supabase
        const { data: dbProfiles } = await supabase.from('profiles').select('*');
        if (dbProfiles && dbProfiles.length > 0) {
          const { data: dbPerms } = await supabase.from('user_page_permissions').select('*');

          setUsersList(prev => {
            const list = [...(prev || [])];
            dbProfiles.forEach(dbUser => {
              if (deletedIds.includes(dbUser.id) || deletedIds.includes(dbUser.email?.toLowerCase())) {
                return; // Do not re-add deleted users
              }

              const userPerms = dbPerms
                ? dbPerms.filter(p => p.user_id === dbUser.id).map(p => p.page_id)
                : [];

              const perms = userPerms.length > 0
                ? userPerms
                : (ROLE_PRESETS[dbUser.role] || ROLE_PRESETS.warehouse_staff);

              const existingIdx = list.findIndex(u =>
                u.id === dbUser.id ||
                u.email?.toLowerCase() === dbUser.email?.toLowerCase()
              );

              const mappedUser = {
                id: dbUser.id,
                email: dbUser.email,
                fullName: dbUser.full_name || dbUser.fullName,
                role: dbUser.role || 'warehouse_staff',
                siteId: dbUser.site_id || 'site-dc',
                hasSetPassword: dbUser.has_set_password ?? true,
                passwordHash: dbUser.password_hash || 'Password123',
                isActive: dbUser.is_active ?? true,
                permittedPages: dbUser.role === 'superadmin' ? ROLE_PRESETS.superadmin : perms
              };

              if (existingIdx >= 0) {
                list[existingIdx] = { ...list[existingIdx], ...mappedUser };
              } else {
                list.push(mappedUser);
              }
            });
            const filtered = list.filter(u => !deletedIds.includes(u.id) && !deletedIds.includes(u.email?.toLowerCase()));
            try {
              localStorage.setItem('mdc_users', JSON.stringify(filtered));
            } catch (e) {}
            return filtered;
          });
        }

        // 2. Hydrate Parts Catalog from Supabase
        const { data: dbParts } = await supabase.from('parts').select('*');
        if (dbParts && dbParts.length > 0) {
          setParts(prev => {
            const map = new Map((prev || []).map(p => [p.part_number, p]));
            dbParts.forEach(p => map.set(p.part_number, { ...p, ...map.get(p.part_number) }));
            const merged = Array.from(map.values());
            try {
              localStorage.setItem('mdc_parts', JSON.stringify(merged));
            } catch (e) {}
            return merged;
          });
        }

        // 3. Hydrate Serialized Inventory from Supabase
        const { data: dbInventory } = await supabase
          .from('inventory_units')
          .select('*, parts(part_number, description), sites(code, name)');

        if (dbInventory && dbInventory.length > 0) {
          const mappedUnits = dbInventory.map(dbU => ({
            id: dbU.id,
            part_id: dbU.part_id,
            part_number: dbU.parts?.part_number || dbU.part_number || 'Unknown',
            description: dbU.parts?.description || dbU.notes || 'Replacement Part',
            serial_number: dbU.serial_number,
            current_site_id: dbU.sites?.code === 'DC-MDC' ? 'site-dc' : (dbU.current_site_id || 'site-dc'),
            status: dbU.status || 'in_stock',
            box_number: dbU.box_number || 1,
            received_at: dbU.received_at || new Date().toISOString(),
            received_by: dbU.received_by_name || 'Warehouse Operations'
          }));

          setInventoryUnits(prev => {
            const map = new Map((prev || []).map(u => [u.serial_number, u]));
            mappedUnits.forEach(u => map.set(u.serial_number, { ...map.get(u.serial_number), ...u }));
            const merged = Array.from(map.values());
            try {
              localStorage.setItem('mdc_inventory', JSON.stringify(merged));
            } catch (e) {}
            return merged;
          });
        }

        // 4. Hydrate Forecast Entries from Supabase
        const { data: dbForecasts } = await supabase
          .from('forecast_entries')
          .select('*, parts(part_number, description)');

        if (dbForecasts && dbForecasts.length > 0) {
          const mappedForecasts = dbForecasts.map(f => ({
            id: f.id,
            part_id: f.part_id,
            part_number: f.parts?.part_number || 'Unknown',
            description: f.parts?.description || 'Part',
            ytd_monthly_counts: f.ytd_monthly_counts || [],
            computed_forecast: f.computed_forecast || 0,
            admin_override: f.admin_override,
            final_forecast: f.final_forecast || f.computed_forecast || 0,
            safety_stock_units: f.safety_stock_units || 0,
            recommended_order: f.recommended_order || 0
          }));
          setForecastItems(mappedForecasts);
          try {
            localStorage.setItem('mdc_forecast', JSON.stringify(mappedForecasts));
          } catch (e) {}
        }

        // 5. Hydrate Allocation Items from Supabase
        const { data: dbAllocations } = await supabase
          .from('allocation_items')
          .select('*, parts(part_number, description), sites(code)');

        if (dbAllocations && dbAllocations.length > 0) {
          const allocMap = new Map();
          dbAllocations.forEach(item => {
            const pn = item.parts?.part_number || item.part_id;
            if (!allocMap.has(pn)) {
              allocMap.set(pn, {
                part_id: item.part_id,
                part_number: pn,
                description: item.parts?.description || 'Part',
                total_allocated_qty: 0,
                w1_qty: 0,
                w2_qty: 0,
                w3_qty: 0,
                w4_qty: 0,
                site_quantities: {}
              });
            }
            const alloc = allocMap.get(pn);
            alloc.total_allocated_qty += item.monthly_allocated_qty || 0;
            alloc.w1_qty += item.week1_qty || 0;
            alloc.w2_qty += item.week2_qty || 0;
            alloc.w3_qty += item.week3_qty || 0;
            alloc.w4_qty += item.week4_qty || 0;
            const sCode = item.sites?.code || item.site_id;
            alloc.site_quantities[sCode] = item.monthly_allocated_qty || 0;
          });
          const mappedAllocs = Array.from(allocMap.values());
          setAllocations(mappedAllocs);
          try {
            localStorage.setItem('mdc_allocations', JSON.stringify(mappedAllocs));
          } catch (e) {}
        }

        // 6. Hydrate Saved Period Records from Supabase
        const { data: dbRecords } = await supabase
          .from('saved_records')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);

        if (dbRecords && dbRecords.length > 0) {
          setSavedRecords(prev => {
            const map = new Map((prev || []).map(r => [r.id, r]));
            dbRecords.forEach(dbR => {
              map.set(dbR.id, {
                id: dbR.id,
                record_type: dbR.record_type || 'both',
                period_label: dbR.period_label || 'Saved Record',
                period_year: dbR.period_year,
                period_month: dbR.period_month,
                period_week: dbR.period_week,
                notes: dbR.notes || '',
                saved_by_name: dbR.saved_by_name || 'System User',
                saved_by_user_id: dbR.saved_by_user_id,
                snapshot_data: dbR.snapshot_data || {},
                created_at: dbR.created_at,
                updated_at: dbR.updated_at
              });
            });
            const merged = Array.from(map.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            try {
              localStorage.setItem('mdc_saved_records', JSON.stringify(merged.slice(0, 50)));
            } catch (e) {}
            return merged;
          });
        }
      } catch (e) {
        console.warn('Supabase initial fetch skipped (offline or unauthenticated):', e.message);
      }
    };

    hydrateFromSupabase();

    // Set up Realtime listener for multi-user synchronization
    try {
      if (supabase && typeof supabase.channel === 'function') {
        realtimeChannel = supabase
          .channel('public-db-changes')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_units' }, () => {
            hydrateFromSupabase();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'forecast_entries' }, () => {
            hydrateFromSupabase();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'allocation_items' }, () => {
            hydrateFromSupabase();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
            hydrateFromSupabase();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_records' }, () => {
            hydrateFromSupabase();
          })
          .subscribe();
      }
    } catch (e) {
      console.warn('Realtime channel notice:', e);
    }

    return () => {
      if (realtimeChannel && supabase) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, []);

  // --- DYNAMIC UPLOAD DATASET APPLIER ---
  const applyParsedDataset = (parsedObj) => {
    if (!parsedObj || !parsedObj.payload) {
      showToast('Invalid dataset: missing payload', 'error');
      return;
    }

    const { type, payload, sheetName } = parsedObj;

    try {
      if (type === 'WORKBOOK_BUNDLE') {
        if (payload.sites && payload.sites.length > 0) {
          setSites(payload.sites);
        }
        if (payload.parts && payload.parts.length > 0) {
          setParts(prev => {
            const map = new Map((prev || []).map(p => [p.part_number, p]));
            payload.parts.forEach(p => map.set(p.part_number, { ...p, ...map.get(p.part_number) }));
            return Array.from(map.values());
          });
        }
        if (payload.forecastItems && payload.forecastItems.length > 0) {
          setForecastItems(payload.forecastItems);
        }
        if (payload.allocations && payload.allocations.length > 0) {
          setAllocations(payload.allocations);
        }
        showToast(`Applied ${payload.forecastItems?.length || 0} forecasts and ${payload.allocations?.length || 0} allocations matching your workbook 100%!`, 'success');
        setActiveTab('forecast');
      } else if (type === 'FORECAST') {
        if (payload.parts && payload.parts.length > 0) {
          setParts(prev => {
            const map = new Map((prev || []).map(p => [p.part_number, p]));
            payload.parts.forEach(p => map.set(p.part_number, { ...p, ...map.get(p.part_number) }));
            return Array.from(map.values());
          });
        }
        setForecastItems(payload.forecastItems || []);
        if (payload.allocations && payload.allocations.length > 0) {
          setAllocations(payload.allocations);
        }
        showToast(`Dynamic forecast matrix updated with ${payload.forecastItems?.length || 0} parts and fair allocations from "${sheetName}"!`, 'success');
        setActiveTab('forecast');
      } else if (type === 'ALLOCATION') {
        if (payload.sites && payload.sites.length > 0) {
          setSites(prev => {
            const map = new Map((prev || []).map(s => [s.code, s]));
            payload.sites.forEach(s => map.set(s.code, s));
            return Array.from(map.values());
          });
        }
        if (payload.parts && payload.parts.length > 0) {
          setParts(prev => {
            const map = new Map((prev || []).map(p => [p.part_number, p]));
            payload.parts.forEach(p => map.set(p.part_number, { ...p, ...map.get(p.part_number) }));
            return Array.from(map.values());
          });
        }
        setAllocations(payload.allocations || []);
        showToast(`Dynamic Master Allocation updated with ${payload.allocations?.length || 0} parts from "${sheetName}"!`, 'success');
        setActiveTab('allocation');
      } else if (type === 'INVENTORY_STOCK') {
        setInventoryUnits(prev => [...(payload.units || []), ...(prev || [])]);
        if (payload.parts && payload.parts.length > 0) {
          setParts(prev => {
            const map = new Map((prev || []).map(p => [p.part_number, p]));
            payload.parts.forEach(p => {
              if (!map.has(p.part_number)) map.set(p.part_number, p);
            });
            return Array.from(map.values());
          });
        }
        showToast(`Imported ${payload.units?.length || 0} inventory units!`, 'success');
        setActiveTab('dashboard');
      } else if (type === 'RAW_USAGE_PIPELINE') {
        if (payload.sites && payload.sites.length > 0) {
          setSites(payload.sites);
        }
        if (payload.parts && payload.parts.length > 0) {
          setParts(prev => {
            const map = new Map((prev || []).map(p => [p.part_number, p]));
            payload.parts.forEach(p => map.set(p.part_number, { ...p, ...map.get(p.part_number) }));
            return Array.from(map.values());
          });
        }
        if (payload.records && payload.records.length > 0) {
          setRepairUsageRecords(prev => [...payload.records, ...(prev || [])]);
        }
        if (payload.forecastItems && payload.forecastItems.length > 0) {
          setForecastItems(payload.forecastItems);
        }
        if (payload.allocations && payload.allocations.length > 0) {
          setAllocations(payload.allocations);
        }
        showToast(`Applied Forecasting & Master Allocation for ${payload.forecastItems?.length || 0} iPhone parts across all sites!`, 'success');
        setActiveTab('forecast');
      } else if (type === 'USAGE_RECORDS') {
        setRepairUsageRecords(prev => [...(payload.records || []), ...(prev || [])]);
        showToast(`Imported ${payload.records?.length || 0} raw repair usage records!`, 'success');
      }

      // Auto-sync entire master dataset to Supabase Cloud in background
      setTimeout(() => {
        syncAllDataToCloud();
      }, 300);
    } catch (err) {
      console.error('Error applying parsed dataset:', err);
      showToast(`Error applying data: ${err.message}`, 'error');
    }
  };

  const resetToDefaultData = () => {
    localStorage.removeItem('mdc_forecast');
    localStorage.removeItem('mdc_allocations');
    localStorage.removeItem('mdc_inventory');
    localStorage.removeItem('mdc_pos');
    localStorage.removeItem('mdc_shipments');
    setCategories(seedData.categories);
    setSites(seedData.sites);
    setParts(seedData.parts);
    setForecastItems(seedData.forecastItems);
    setAllocations(seedData.allocations);
    setInventoryUnits(seedData.inventoryUnits || []);
    setPurchaseOrders([
      {
        id: 'po-202608-01',
        po_number: 'PO-2026-AUG-BATTERY',
        order_date: '2026-08-01',
        expected_date: '2026-08-10',
        status: 'partially_received',
        remarks: 'Monthly Battery replenishment for iPhone 13-17 series',
        items: [
          { part_id: 'part-661-21991', part_number: '661-21991', description: 'Battery, iPhone 13', quantity_ordered: 175, quantity_received: 120, unit_price: 65 },
          { part_id: 'part-661-21996', part_number: '661-21996', description: 'Battery, iPhone 13 Pro', quantity_ordered: 22, quantity_received: 15, unit_price: 75 },
          { part_id: 'part-661-22294', part_number: '661-22294', description: 'Battery, iPhone 13 Pro Max', quantity_ordered: 24, quantity_received: 24, unit_price: 85 }
        ]
      },
      {
        id: 'po-202608-02',
        po_number: 'PO-2026-AUG-DISPLAY',
        order_date: '2026-08-02',
        expected_date: '2026-08-12',
        status: 'submitted',
        remarks: 'Monthly Display replenishment',
        items: [
          { part_id: 'part-661-21993', part_number: '661-21993', description: 'Display, iPhone 13 Pro', quantity_ordered: 3, quantity_received: 0, unit_price: 279 },
          { part_id: 'part-661-30401', part_number: '661-30401', description: 'Display, iPhone 14 Pro Max', quantity_ordered: 6, quantity_received: 0, unit_price: 379 }
        ]
      }
    ]);
    showToast('Loaded sample August 2026 dataset for demonstration', 'info');
  };

  const clearAllData = () => {
    localStorage.removeItem('mdc_forecast');
    localStorage.removeItem('mdc_allocations');
    localStorage.removeItem('mdc_inventory');
    localStorage.removeItem('mdc_pos');
    localStorage.removeItem('mdc_shipments');
    localStorage.removeItem('mdc_scan_logs');
    localStorage.removeItem('mdc_repair_usage');
    setForecastItems([]);
    setAllocations([]);
    setInventoryUnits([]);
    setPurchaseOrders([]);
    setShipments([]);
    setScanLogs([]);
    setRepairUsageRecords([]);
    showToast('Cleared all operational data. System is now in an empty state.', 'info');
  };

  // --- ACTIONS ---

  // 1. Scan-In Unit (Receiving into DC)
  const addScanInUnit = ({ partNumber, serialNumber, poId }) => {
    const cleanPN = partNumber.trim().toUpperCase();
    const cleanSerial = serialNumber.trim().toUpperCase();

    if (!cleanPN || !cleanSerial) {
      barcodeAudio.playError();
      showToast('Scan error: Missing part number or serial number', 'error');
      return { success: false, error: 'Missing part number or serial number' };
    }

    let part = parts.find(p => p.part_number.toUpperCase() === cleanPN);
    if (!part) {
      const newPart = {
        id: `part-${cleanPN}`,
        part_number: cleanPN,
        description: `Replacement Part (${cleanPN})`,
        category_id: 'cat-battery',
        iphone_model: 'iPhone Model',
        stocking_price: 100,
        is_active: true
      };
      setParts(prev => [newPart, ...prev]);
      part = newPart;
    }

    const existingUnit = inventoryUnits.find(u => u.serial_number.toUpperCase() === cleanSerial);
    if (existingUnit) {
      barcodeAudio.playError();
      showToast(`Duplicate Serial: ${cleanSerial} already exists in DC stock!`, 'error');
      logScan('RECEIVE_IN', cleanPN, cleanSerial, false, 'Duplicate serial number');
      return { success: false, error: `Duplicate serial number: ${cleanSerial}` };
    }

    const newUnit = {
      id: `unit-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      part_id: part.id,
      part_number: part.part_number,
      description: part.description,
      serial_number: cleanSerial,
      current_site_id: 'site-dc',
      po_id: poId || null,
      status: 'in_stock',
      box_number: 1,
      received_at: new Date().toISOString(),
      received_by: currentUser?.fullName || 'Warehouse Staff'
    };

    setInventoryUnits(prev => [newUnit, ...prev]);

    // Immediate LocalStorage update
    try {
      const updatedInv = [newUnit, ...inventoryUnits];
      localStorage.setItem('mdc_inventory', JSON.stringify(updatedInv));
      localStorage.setItem('mdc_parts', JSON.stringify(parts));
      const currentRecent = JSON.parse(localStorage.getItem('mdc_recent_scans') || '[]');
      localStorage.setItem('mdc_recent_scans', JSON.stringify([newUnit, ...currentRecent].slice(0, 300)));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }

    // Background Supabase Sync
    if (supabase) {
      (async () => {
        try {
          // 1. Get real Part UUID from Supabase
          let dbPartId = null;
          const { data: dbPart } = await supabase
            .from('parts')
            .select('id')
            .eq('part_number', cleanPN)
            .maybeSingle();

          if (dbPart?.id) {
            dbPartId = dbPart.id;
          } else {
            const { data: dbCat } = await supabase.from('part_categories').select('id').limit(1).maybeSingle();
            const { data: newDbPart } = await supabase
              .from('parts')
              .upsert({
                part_number: cleanPN,
                description: part.description || `Part ${cleanPN}`,
                ...(dbCat?.id ? { category_id: dbCat.id } : {})
              }, { onConflict: 'part_number' })
              .select('id')
              .maybeSingle();
            dbPartId = newDbPart?.id || null;
          }

          // 2. Get DC Site UUID
          const { data: dcSite } = await supabase
            .from('sites')
            .select('id')
            .or('is_dc.eq.true,code.eq.DC-MDC')
            .limit(1)
            .maybeSingle();

          if (dbPartId && dcSite?.id) {
            await supabase.from('inventory_units').upsert({
              part_id: dbPartId,
              current_site_id: dcSite.id,
              serial_number: cleanSerial,
              status: newUnit.status || 'in_stock',
              box_number: newUnit.box_number || 1,
              notes: newUnit.description || null,
              received_at: newUnit.received_at
            }, { onConflict: 'serial_number' });
          }
        } catch (dbErr) {
          console.warn('Supabase sync notice:', dbErr.message);
        }
      })();
    }

    if (poId) {
      setPurchaseOrders(prev => prev.map(po => {
        if (po.id === poId) {
          const updatedItems = po.items.map(item => {
            if (item.part_number.toUpperCase() === cleanPN) {
              return { ...item, quantity_received: item.quantity_received + 1 };
            }
            return item;
          });
          const allReceived = updatedItems.every(it => it.quantity_received >= it.quantity_ordered);
          return {
            ...po,
            items: updatedItems,
            status: allReceived ? 'received' : 'partially_received'
          };
        }
        return po;
      }));
    }

    barcodeAudio.playSuccess();
    logScan('RECEIVE_IN', cleanPN, cleanSerial, true);
    showToast(`Received ${part.description} (${cleanSerial})`, 'success');
    return { success: true, unit: newUnit };
  };

  // 1.1 Batch Scan-In Units (from XLSX/CSV file upload)
  const batchAddScanInUnits = (itemsList = [], defaultPoId = null) => {
    if (!itemsList || itemsList.length === 0) {
      return { success: false, error: 'No units provided to import' };
    }

    const newUnits = [];
    const newLogs = [];
    const poMap = new Map();
    const newlyCreatedParts = [];
    let currentParts = [...parts];

    const existingSerials = new Set(inventoryUnits.map(u => String(u.serial_number || '').trim().toUpperCase()));

    for (const item of itemsList) {
      const cleanPN = String(item.partNumber || '').trim().toUpperCase();
      const cleanSerial = String(item.serialNumber || '').trim().toUpperCase();

      if (!cleanPN || !cleanSerial) {
        continue;
      }

      if (existingSerials.has(cleanSerial)) {
        continue; // Skip existing duplicates
      }
      existingSerials.add(cleanSerial);

      let part = currentParts.find(p => p.part_number.toUpperCase() === cleanPN);
      if (!part) {
        const newPart = {
          id: `part-${cleanPN}`,
          part_number: cleanPN,
          description: item.description || `Replacement Part (${cleanPN})`,
          category_id: 'cat-battery',
          iphone_model: 'iPhone Model',
          stocking_price: 100,
          is_active: true
        };
        currentParts = [newPart, ...currentParts];
        newlyCreatedParts.push(newPart);
        part = newPart;
      }

      const assignedPoId = item.poId || defaultPoId || null;

      const newUnit = {
        id: `unit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        part_id: part.id,
        part_number: part.part_number,
        description: item.description || part.description,
        serial_number: cleanSerial,
        current_site_id: 'site-dc',
        po_id: assignedPoId,
        status: 'in_stock',
        box_number: item.boxNumber || 1,
        received_at: new Date().toISOString(),
        received_by: currentUser?.fullName || 'Warehouse Staff (Import)'
      };

      newUnits.push(newUnit);

      if (assignedPoId) {
        if (!poMap.has(assignedPoId)) {
          poMap.set(assignedPoId, new Map());
        }
        const pnMap = poMap.get(assignedPoId);
        pnMap.set(cleanPN, (pnMap.get(cleanPN) || 0) + 1);
      }

      newLogs.push({
        id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        scan_type: 'RECEIVE_IN_BATCH',
        part_number: cleanPN,
        serial_number: cleanSerial,
        user_name: currentUser?.fullName || 'Warehouse Staff (Import)',
        is_valid: true,
        error_message: null,
        created_at: new Date().toISOString()
      });
    }

    if (newUnits.length === 0) {
      return { success: false, error: 'No new units to import (all duplicate serials or invalid)' };
    }

    if (newlyCreatedParts.length > 0) {
      setParts(currentParts);
    }

    setInventoryUnits(prev => [...newUnits, ...prev]);

    // Immediate LocalStorage persistence
    try {
      const updatedInv = [...newUnits, ...inventoryUnits];
      localStorage.setItem('mdc_inventory', JSON.stringify(updatedInv));
      localStorage.setItem('mdc_parts', JSON.stringify(currentParts));
      
      const currentRecent = JSON.parse(localStorage.getItem('mdc_recent_scans') || '[]');
      const newRecent = [...newUnits.map(u => ({ ...u, isImported: true })), ...currentRecent].slice(0, 500);
      localStorage.setItem('mdc_recent_scans', JSON.stringify(newRecent));
    } catch (e) {
      console.warn('LocalStorage save error in batchAddScanInUnits:', e);
    }

    // Background Supabase Sync
    if (supabase) {
      (async () => {
        try {
          const { data: dbParts } = await supabase.from('parts').select('id, part_number');
          const { data: dcSite } = await supabase.from('sites').select('id').or('is_dc.eq.true,code.eq.DC-MDC').limit(1).maybeSingle();
          const pMap = new Map((dbParts || []).map(p => [p.part_number, p.id]));

          const rows = [];
          for (const u of newUnits) {
            const pId = pMap.get(u.part_number);
            if (pId && dcSite?.id) {
              rows.push({
                part_id: pId,
                current_site_id: dcSite.id,
                serial_number: u.serial_number,
                status: u.status || 'in_stock',
                box_number: u.box_number || 1,
                notes: u.description || null,
                received_at: u.received_at
              });
            }
          }

          if (rows.length > 0) {
            await supabase.from('inventory_units').upsert(rows, { onConflict: 'serial_number' });
          }
        } catch (dbErr) {
          console.warn('Supabase batch sync notice:', dbErr.message);
        }
      })();
    }

    if (poMap.size > 0) {
      setPurchaseOrders(prev => prev.map(po => {
        if (poMap.has(po.id)) {
          const pnIncrements = poMap.get(po.id);
          const updatedItems = po.items.map(it => {
            const inc = pnIncrements.get(it.part_number.toUpperCase()) || 0;
            if (inc > 0) {
              return { ...it, quantity_received: it.quantity_received + inc };
            }
            return it;
          });
          const allReceived = updatedItems.every(it => it.quantity_received >= it.quantity_ordered);
          return {
            ...po,
            items: updatedItems,
            status: allReceived ? 'received' : 'partially_received'
          };
        }
        return po;
      }));
    }

    setScanLogs(prev => [...newLogs, ...prev].slice(0, 200));

    barcodeAudio.playSuccess();
    showToast(`Successfully batch-received ${newUnits.length} parts into DC Inventory!`, 'success');
    return { success: true, count: newUnits.length, units: newUnits };
  };

  // 2. Scan-Out Unit (Adding to Packing List)
  const addScanOutUnit = ({ shipmentId, siteId, partNumber, serialNumber, boxNumber = 1 }) => {
    const cleanPN = partNumber.trim().toUpperCase();
    const cleanSerial = serialNumber.trim().toUpperCase();

    const unitIndex = inventoryUnits.findIndex(u => 
      u.serial_number.toUpperCase() === cleanSerial && 
      u.part_number.toUpperCase() === cleanPN
    );

    if (unitIndex === -1) {
      barcodeAudio.playError();
      showToast(`Unit not found in stock: ${cleanPN} / ${cleanSerial}`, 'error');
      logScan('PACK_OUT', cleanPN, cleanSerial, false, 'Unit not found in stock');
      return { success: false, error: 'Unit not found in DC stock' };
    }

    const unit = inventoryUnits[unitIndex];
    if (unit.status !== 'in_stock' && unit.status !== 'allocated') {
      barcodeAudio.playError();
      showToast(`Unit ${cleanSerial} cannot be scanned out (Status: ${unit.status})`, 'error');
      logScan('PACK_OUT', cleanPN, cleanSerial, false, `Invalid status: ${unit.status}`);
      return { success: false, error: `Unit is already ${unit.status}` };
    }

    const updatedUnits = [...inventoryUnits];
    updatedUnits[unitIndex] = {
      ...unit,
      status: 'packed',
      current_site_id: siteId,
      box_number: boxNumber,
      shipped_at: new Date().toISOString(),
      shipped_by: currentUser?.fullName || 'Warehouse Staff'
    };
    setInventoryUnits(updatedUnits);

    const itemToAdd = {
      part_number: unit.part_number,
      description: unit.description,
      serial_number: unit.serial_number,
      box_number: boxNumber
    };

    setShipments(prev => prev.map(sh => {
      if (sh.id === shipmentId) {
        return {
          ...sh,
          items: [...(sh.items || []), itemToAdd]
        };
      }
      return sh;
    }));

    barcodeAudio.playSuccess();
    logScan('PACK_OUT', cleanPN, cleanSerial, true);
    showToast(`Packed: ${unit.description} (#${cleanSerial}) into Box ${boxNumber}`, 'success');
    return { success: true, item: itemToAdd };
  };

  // 2.1 Batch Scan-Out Units (from XLSX / CSV file upload)
  const batchAddScanOutUnits = ({ shipmentId, siteId, items }) => {
    if (!items || items.length === 0) {
      return { success: false, error: 'No items to pack' };
    }

    const itemsToAdd = [];
    const newLogs = [];
    const updatedSerialsMap = new Map();

    for (const item of items) {
      const cleanPN = String(item.partNumber || '').trim().toUpperCase();
      const cleanSerial = String(item.serialNumber || '').trim().toUpperCase();
      const box = item.boxNumber || 1;
      const targetSiteId = item.siteId || siteId;

      const unit = inventoryUnits.find(u =>
        u.serial_number.toUpperCase() === cleanSerial &&
        (u.status === 'in_stock' || u.status === 'allocated')
      );

      if (unit) {
        updatedSerialsMap.set(unit.serial_number.toUpperCase(), {
          ...unit,
          status: 'packed',
          current_site_id: targetSiteId,
          box_number: box,
          shipped_at: new Date().toISOString(),
          shipped_by: currentUser?.fullName || 'Warehouse Staff (Import)'
        });

        itemsToAdd.push({
          part_number: unit.part_number,
          description: unit.description,
          serial_number: unit.serial_number,
          box_number: box
        });

        newLogs.push({
          id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          scan_type: 'PACK_OUT_BATCH',
          part_number: cleanPN || unit.part_number,
          serial_number: cleanSerial,
          user_name: currentUser?.fullName || 'Warehouse Staff (Import)',
          is_valid: true,
          error_message: null,
          created_at: new Date().toISOString()
        });
      }
    }

    if (itemsToAdd.length === 0) {
      return { success: false, error: 'No matching in-stock units found to pack.' };
    }

    // Update inventoryUnits
    const updatedInventory = inventoryUnits.map(u => {
      const match = updatedSerialsMap.get(u.serial_number.toUpperCase());
      return match ? match : u;
    });
    setInventoryUnits(updatedInventory);

    // Update shipments
    let targetShipmentNumber = '';
    setShipments(prev => prev.map(sh => {
      if (sh.id === shipmentId) {
        targetShipmentNumber = sh.invoice_ref || sh.shipment_number;
        return {
          ...sh,
          items: [...(sh.items || []), ...itemsToAdd]
        };
      }
      return sh;
    }));

    // Update logs
    setScanLogs(prev => [...newLogs, ...prev].slice(0, 300));

    // Immediate LocalStorage update
    try {
      localStorage.setItem('mdc_inventory', JSON.stringify(updatedInventory));
    } catch (e) {
      console.warn('LocalStorage save error in batchAddScanOutUnits:', e);
    }

    barcodeAudio.playSuccess();
    showToast(`Batch packed ${itemsToAdd.length} units into ${targetShipmentNumber || 'Shipment'}!`, 'success');
    return { success: true, count: itemsToAdd.length, items: itemsToAdd };
  };

  // 2.2 Clear / Unpack Items from a Specific Shipment Draft
  const clearShipmentDraftItems = (shipmentId) => {
    const targetShipment = shipments.find(s => s.id === shipmentId);
    if (!targetShipment || !targetShipment.items || targetShipment.items.length === 0) {
      return { success: true, count: 0 };
    }

    const serialsToRevert = new Set(targetShipment.items.map(it => it.serial_number.toUpperCase()));
    
    // Revert units status back to in_stock
    const updatedInventory = inventoryUnits.map(u => {
      if (serialsToRevert.has(u.serial_number.toUpperCase())) {
        return {
          ...u,
          status: 'in_stock',
          current_site_id: 'site-dc',
          box_number: 1,
          shipped_at: null,
          shipped_by: null
        };
      }
      return u;
    });
    setInventoryUnits(updatedInventory);

    // Empty shipment items
    setShipments(prev => prev.map(sh => {
      if (sh.id === shipmentId) {
        return { ...sh, items: [] };
      }
      return sh;
    }));

    // Immediate LocalStorage save
    try {
      localStorage.setItem('mdc_inventory', JSON.stringify(updatedInventory));
      localStorage.removeItem('mdc_active_pack_draft');
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }

    showToast(`Cleared ${serialsToRevert.size} packed items. Units reverted back to In-Stock DC inventory.`, 'info');
    return { success: true, count: serialsToRevert.size };
  };

  // 2.3 Batch Import Shipments / Manifests
  const batchImportShipments = (newShipmentsList) => {
    if (!newShipmentsList || newShipmentsList.length === 0) {
      return { success: false, error: 'No shipments to import' };
    }

    setShipments(prev => [...newShipmentsList, ...prev]);

    // Immediate storage
    try {
      const updated = [...newShipmentsList, ...shipments];
      localStorage.setItem('mdc_shipments', JSON.stringify(updated));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }

    showToast(`Successfully imported ${newShipmentsList.length} shipment manifests!`, 'success');
    return { success: true, count: newShipmentsList.length };
  };

  // 2.4 Clear All Shipments & Packing Records
  const clearAllShipmentsData = () => {
    // Revert all packed units back to in_stock
    const updatedInventory = inventoryUnits.map(u => {
      if (u.status === 'packed' || u.status === 'shipped') {
        return {
          ...u,
          status: 'in_stock',
          current_site_id: 'site-dc',
          shipped_at: null,
          shipped_by: null
        };
      }
      return u;
    });
    setInventoryUnits(updatedInventory);
    setShipments([]);

    try {
      localStorage.setItem('mdc_inventory', JSON.stringify(updatedInventory));
      localStorage.removeItem('mdc_shipments');
      localStorage.removeItem('mdc_active_pack_draft');
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }

    showToast('Cleared all shipment records and restored parts to DC stock.', 'info');
  };

  const logScan = (scanType, partNumber, serialNumber, isValid, errorMessage = null) => {
    const logEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      scan_type: scanType,
      part_number: partNumber,
      serial_number: serialNumber,
      user_name: currentUser?.fullName || 'Staff',
      is_valid: isValid,
      error_message: errorMessage,
      created_at: new Date().toISOString()
    };
    setScanLogs(prev => [logEntry, ...prev.slice(0, 199)]);
  };

  const saveShipment = (shipmentData) => {
    if (shipmentData.id && shipments.some(s => s.id === shipmentData.id)) {
      setShipments(prev => prev.map(s => s.id === shipmentData.id ? shipmentData : s));
      showToast(`Shipment ${shipmentData.invoice_ref || shipmentData.shipment_number} updated`, 'success');
    } else {
      const newShipment = {
        ...shipmentData,
        id: shipmentData.id || `ship-${Date.now()}`,
        shipment_number: shipmentData.shipment_number || `SHIP-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(shipments.length + 1).padStart(3, '0')}`,
        created_at: new Date().toISOString()
      };
      setShipments(prev => [newShipment, ...prev]);
      showToast(`Created Packing List Manifest: ${newShipment.shipment_number}`, 'success');
      return newShipment;
    }
  };

  const updateForecastOverride = (partId, overrideVal) => {
    setForecastItems(prev => prev.map(item => {
      if (item.part_id === partId) {
        const override = overrideVal === '' || overrideVal === null ? null : parseInt(overrideVal);
        const finalForecast = override !== null ? override : item.computed_forecast;
        const rec = calculateRecommendedOrder(item.computed_forecast, 0.05, override);
        return {
          ...item,
          admin_override: override,
          final_forecast: finalForecast,
          recommended_order: rec.recommendedOrder
        };
      }
      return item;
    }));
  };

  const updateSiteAllocation = (partId, siteId, newQty) => {
    setAllocations(prev => prev.map(item => {
      if (item.part_id === partId) {
        const updatedSiteQty = {
          ...item.site_quantities,
          [siteId]: Math.max(0, parseInt(newQty) || 0)
        };
        const newTotal = Object.values(updatedSiteQty).reduce((a, b) => a + b, 0);
        const split = calculateWeeklySplit(newTotal, 0);
        return {
          ...item,
          site_quantities: updatedSiteQty,
          total_allocated_qty: newTotal,
          w1_qty: split.week1,
          w2_qty: split.week2,
          w3_qty: split.week3,
          w4_qty: split.week4
        };
      }
      return item;
    }));
  };

  const runAutoAllocation = (partId, availableStock) => {
    const part = parts.find(p => p.id === partId);
    if (!part) return;

    const siteDemands = sites.filter(s => !s.is_dc).map(s => {
      const currentAlloc = allocations.find(a => a.part_id === partId);
      const histDemand = currentAlloc?.site_quantities?.[s.id] || 1;
      return {
        siteId: s.id,
        historicalDemand: histDemand
      };
    });

    const allocatedResults = calculateProportionalAllocation(availableStock, siteDemands);
    const siteQuantities = {};
    allocatedResults.forEach(res => {
      siteQuantities[res.siteId] = res.allocatedQty;
    });

    const split = calculateWeeklySplit(availableStock, 0);

    setAllocations(prev => {
      const exists = prev.some(a => a.part_id === partId);
      const newAllocObj = {
        part_id: partId,
        part_number: part.part_number,
        description: part.description,
        total_allocated_qty: availableStock,
        w1_qty: split.week1,
        w2_qty: split.week2,
        w3_qty: split.week3,
        w4_qty: split.week4,
        site_quantities: siteQuantities
      };
      if (exists) {
        return prev.map(a => a.part_id === partId ? newAllocObj : a);
      }
      return [...prev, newAllocObj];
    });

    showToast(`Auto-allocated ${availableStock} units of ${part.description} across ${siteDemands.length} sites`, 'success');
  };

  const savePart = (partData) => {
    if (partData.id) {
      setParts(prev => prev.map(p => p.id === partData.id ? partData : p));
      showToast(`Updated part ${partData.part_number}`, 'success');
    } else {
      const newPart = {
        ...partData,
        id: `part-${partData.part_number || Date.now()}`,
        is_active: true
      };
      setParts(prev => [...prev, newPart]);
      showToast(`Added part ${newPart.part_number} to catalog`, 'success');
    }
  };

  const saveSite = (siteData) => {
    if (siteData.id) {
      setSites(prev => prev.map(s => s.id === siteData.id ? siteData : s));
      showToast(`Updated site ${siteData.name}`, 'success');
    } else {
      const newSite = {
        ...siteData,
        id: `site-${Date.now()}`,
        is_active: true
      };
      setSites(prev => [...prev, newSite]);
      showToast(`Added site ${newSite.name}`, 'success');
    }
  };

  const syncAllDataToCloud = async () => {
    if (!supabase) {
      showToast('Supabase client is not connected', 'error');
      return { success: false };
    }

    try {
      showToast('Syncing all local master data to Supabase cloud...', 'info');

      // 1. Sync Categories
      if (categories && categories.length > 0) {
        const catRows = categories.map((c, i) => ({
          code: c.code,
          name: c.name,
          has_imei: c.has_imei || false,
          is_serialized: c.is_serialized ?? true,
          sort_order: c.sort_order || i + 1
        }));
        await supabase.from('part_categories').upsert(catRows, { onConflict: 'code' });
      }

      // 2. Sync Sites
      if (sites && sites.length > 0) {
        const siteRows = sites.map(s => ({
          code: s.code,
          name: s.name,
          region: s.region || 'Metro Manila',
          address: s.address || '',
          contact_person: s.contact_person || '',
          contact_phone: s.contact_phone || '',
          is_dc: s.is_dc || false,
          is_active: s.is_active ?? true
        }));
        await supabase.from('sites').upsert(siteRows, { onConflict: 'code' });
      }

      // 3. Sync Parts Catalog
      if (parts && parts.length > 0) {
        const { data: dbCats } = await supabase.from('part_categories').select('id, code');
        const catMap = new Map((dbCats || []).map(c => [c.code, c.id]));

        const partRows = parts.map(p => {
          const catCode = categories.find(c => c.id === p.category_id)?.code || 'BATTERY';
          const catId = catMap.get(catCode) || null;
          return {
            part_number: p.part_number,
            description: p.description,
            iphone_model: p.iphone_model || '',
            stocking_price: p.stocking_price || 0,
            safety_stock_pct: p.safety_stock_pct || 0.05,
            is_active: p.is_active ?? true,
            ...(catId ? { category_id: catId } : {})
          };
        });
        await supabase.from('parts').upsert(partRows, { onConflict: 'part_number' });
      }

      // 4. Sync Inventory Units
      if (inventoryUnits && inventoryUnits.length > 0) {
        const { data: dbParts } = await supabase.from('parts').select('id, part_number');
        const { data: dbSites } = await supabase.from('sites').select('id, code');
        const pMap = new Map((dbParts || []).map(p => [p.part_number, p.id]));
        const sMap = new Map((dbSites || []).map(s => [s.code, s.id]));

        const unitRows = inventoryUnits.map(u => {
          const partId = pMap.get(u.part_number) || null;
          const siteCode = sites.find(s => s.id === u.current_site_id)?.code || 'DC-MDC';
          const siteId = sMap.get(siteCode) || null;

          return {
            serial_number: u.serial_number,
            part_number: u.part_number,
            status: u.status || 'in_stock',
            box_number: u.box_number || 1,
            received_by_name: u.received_by || 'Warehouse Operations',
            ...(partId ? { part_id: partId } : {}),
            ...(siteId ? { current_site_id: siteId } : {})
          };
        });
        await supabase.from('inventory_units').upsert(unitRows, { onConflict: 'serial_number' });
      }

      // 5. Sync Forecast Cycles & Forecast Entries
      if (forecastItems && forecastItems.length > 0) {
        const { data: dbCycle } = await supabase
          .from('forecast_cycles')
          .upsert({
            period_year: 2026,
            period_month: 8,
            status: 'active',
            notes: 'August 2026 Demand Forecast Cycle'
          }, { onConflict: 'period_year,period_month' })
          .select('id')
          .maybeSingle();

        if (dbCycle?.id) {
          const { data: dbParts } = await supabase.from('parts').select('id, part_number');
          const pMap = new Map((dbParts || []).map(p => [p.part_number, p.id]));

          const forecastRows = [];
          for (const f of forecastItems) {
            const pId = pMap.get(f.part_number);
            if (pId) {
              forecastRows.push({
                forecast_cycle_id: dbCycle.id,
                part_id: pId,
                ytd_monthly_counts: f.ytd_monthly_counts || [],
                computed_forecast: f.computed_forecast || 0,
                admin_override: f.admin_override || null,
                final_forecast: f.final_forecast || f.computed_forecast || 0,
                safety_stock_units: f.safety_stock_units || 0,
                recommended_order: f.recommended_order || 0
              });
            }
          }
          if (forecastRows.length > 0) {
            await supabase.from('forecast_entries').upsert(forecastRows, { onConflict: 'forecast_cycle_id,part_id' });
          }
        }
      }

      // 6. Sync Allocation Cycles & Allocation Items
      if (allocations && allocations.length > 0) {
        const { data: dbAllocCycle } = await supabase
          .from('allocation_cycles')
          .upsert({
            period_year: 2026,
            period_month: 8,
            status: 'approved'
          })
          .select('id')
          .maybeSingle();

        if (dbAllocCycle?.id) {
          const { data: dbParts } = await supabase.from('parts').select('id, part_number');
          const { data: dbSites } = await supabase.from('sites').select('id, code');
          const pMap = new Map((dbParts || []).map(p => [p.part_number, p.id]));
          const sMap = new Map((dbSites || []).map(s => [s.code, s.id]));

          const allocRows = [];
          for (const a of allocations) {
            const pId = pMap.get(a.part_number);
            if (pId && a.site_quantities) {
              Object.entries(a.site_quantities).forEach(([siteCode, qty]) => {
                const sId = sMap.get(siteCode);
                if (sId) {
                  allocRows.push({
                    allocation_cycle_id: dbAllocCycle.id,
                    part_id: pId,
                    site_id: sId,
                    monthly_allocated_qty: Number(qty) || 0,
                    week1_qty: a.w1_qty || 0,
                    week2_qty: a.w2_qty || 0,
                    week3_qty: a.w3_qty || 0,
                    week4_qty: a.w4_qty || 0
                  });
                }
              });
            }
          }
          if (allocRows.length > 0) {
            await supabase.from('allocation_items').upsert(allocRows, { onConflict: 'allocation_cycle_id,part_id,site_id' });
          }
        }
      }

      // 7. Sync Users
      if (usersList && usersList.length > 0) {
        const deletedIds = JSON.parse(localStorage.getItem('mdc_deleted_user_ids') || '[]');
        const activeUsers = usersList.filter(u => !deletedIds.includes(u.id) && !deletedIds.includes(u.email?.toLowerCase()));
        for (const u of activeUsers) {
          const { data: prof } = await supabase.from('profiles').upsert({
            email: u.email.trim().toLowerCase(),
            full_name: u.fullName.trim(),
            role: u.role || 'warehouse_staff',
            has_set_password: u.hasSetPassword ?? true,
            is_active: u.isActive ?? true,
            updated_at: new Date().toISOString()
          }, { onConflict: 'email' }).select();

          if (prof && prof[0] && u.permittedPages && u.permittedPages.length > 0) {
            const perms = u.permittedPages.map(pg => ({ user_id: prof[0].id, page_id: pg }));
            await supabase.from('user_page_permissions').upsert(perms, { onConflict: 'user_id,page_id' });
          }
        }
      }

      showToast('All master data, forecasts, allocations, inventory & users synced to Supabase Cloud!', 'success');
      return { success: true };
    } catch (err) {
      console.error('Cloud sync error:', err);
      showToast(`Cloud sync error: ${err.message}`, 'error');
      return { success: false, error: err.message };
    }
  };

  // --- PERIOD-BASED SAVED RECORDS (FORECAST & ALLOCATION HISTORICAL SNAPSHOTS) ---

  // 1. Save Current Working Data as a New Labeled Historical Record
  const savePeriodRecord = async ({
    recordType = 'both', // 'forecast' | 'allocation' | 'both'
    periodLabel,
    periodYear,
    periodMonth,
    periodWeek = null,
    notes = ''
  }) => {
    // 1. Validate data availability
    if (recordType === 'forecast' && (!forecastItems || forecastItems.length === 0)) {
      showToast('Cannot save record: Forecast matrix has no items.', 'error');
      return { success: false, error: 'Forecast table is empty' };
    }

    if (recordType === 'allocation' && (!allocations || allocations.length === 0)) {
      showToast('Cannot save record: Allocation matrix has no items.', 'error');
      return { success: false, error: 'Allocation table is empty' };
    }

    if (recordType === 'both' && (!forecastItems || forecastItems.length === 0) && (!allocations || allocations.length === 0)) {
      showToast('Cannot save record: Both Forecast and Allocation tables are empty.', 'error');
      return { success: false, error: 'Both tables are empty' };
    }

    const cleanLabel = (periodLabel || '').trim();
    if (!cleanLabel) {
      showToast('Please provide a name or label for this period record.', 'warning');
      return { success: false, error: 'Missing period label' };
    }

    // 2. Compute Summary Metrics
    const totalForecastUnits = (forecastItems || []).reduce((sum, item) => sum + (item.final_forecast || item.computed_forecast || 0), 0);
    const totalAllocatedUnits = (allocations || []).reduce((sum, item) => sum + (item.total_allocated_qty || 0), 0);
    const activeSitesCount = (sites || []).filter(s => !s.is_dc).length;

    let grandTotalValue = 0;
    (allocations || []).forEach(item => {
      const part = (parts || []).find(p => p.id === item.part_id || p.part_number === item.part_number);
      const price = part?.stocking_price || (item.description?.toLowerCase().includes('display') ? 280 : 150);
      grandTotalValue += (item.total_allocated_qty || 0) * price;
    });

    // 3. Build Self-Contained Snapshot
    const snapshotData = {
      forecastItems: recordType !== 'allocation' ? JSON.parse(JSON.stringify(forecastItems || [])) : [],
      allocations: recordType !== 'forecast' ? JSON.parse(JSON.stringify(allocations || [])) : [],
      parts: JSON.parse(JSON.stringify(parts || [])),
      sites: JSON.parse(JSON.stringify(sites || [])),
      summary: {
        totalForecastUnits,
        totalAllocatedUnits,
        totalForecastParts: recordType !== 'allocation' ? (forecastItems || []).length : 0,
        totalAllocatedParts: recordType !== 'forecast' ? (allocations || []).length : 0,
        totalSites: activeSitesCount,
        grandTotalValue
      }
    };

    const newRecordId = `rec-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const newRecord = {
      id: newRecordId,
      record_type: recordType,
      period_label: cleanLabel,
      period_year: parseInt(periodYear) || new Date().getFullYear(),
      period_month: parseInt(periodMonth) || (new Date().getMonth() + 1),
      period_week: periodWeek ? parseInt(periodWeek) : null,
      notes: (notes || '').trim(),
      saved_by_name: currentUser?.fullName || 'Warehouse Operations',
      saved_by_user_id: currentUser?.id && !currentUser.id.startsWith('usr-') ? currentUser.id : null,
      snapshot_data: snapshotData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // 4. Update Local State immediately
    setSavedRecords(prev => [newRecord, ...prev]);

    try {
      const currentSaved = [newRecord, ...savedRecords].slice(0, 50);
      localStorage.setItem('mdc_saved_records', JSON.stringify(currentSaved));
    } catch (e) {
      console.warn('LocalStorage save notice for saved records:', e);
    }

    // 5. Cloud Backup to Supabase
    if (supabase) {
      (async () => {
        try {
          const { error } = await supabase.from('saved_records').upsert({
            id: newRecord.id,
            record_type: newRecord.record_type,
            period_label: newRecord.period_label,
            period_year: newRecord.period_year,
            period_month: newRecord.period_month,
            period_week: newRecord.period_week,
            notes: newRecord.notes,
            saved_by_name: newRecord.saved_by_name,
            saved_by_user_id: newRecord.saved_by_user_id,
            snapshot_data: newRecord.snapshot_data,
            created_at: newRecord.created_at,
            updated_at: newRecord.updated_at
          });
          if (error) throw error;
        } catch (dbErr) {
          console.warn('Supabase saved_records cloud sync note (saved locally):', dbErr.message);
        }
      })();
    }

    showToast(`Saved period record: "${newRecord.period_label}"`, 'success');
    return { success: true, record: newRecord };
  };

  // 2. Restore a Historical Record into Live Working Tables
  const restorePeriodRecord = (recordId, options = { restoreForecast: true, restoreAllocation: true }) => {
    const record = savedRecords.find(r => r.id === recordId);
    if (!record) {
      showToast('Record not found', 'error');
      return { success: false, error: 'Record not found' };
    }

    const snap = record.snapshot_data || {};

    // 1. Safely merge any missing parts from the snapshot catalog
    if (snap.parts && snap.parts.length > 0) {
      setParts(prev => {
        const map = new Map((prev || []).map(p => [p.part_number, p]));
        snap.parts.forEach(p => {
          if (!map.has(p.part_number)) map.set(p.part_number, p);
        });
        const merged = Array.from(map.values());
        try { localStorage.setItem('mdc_parts', JSON.stringify(merged)); } catch (e) {}
        return merged;
      });
    }

    // 2. Safely merge any missing sites from the snapshot catalog
    if (snap.sites && snap.sites.length > 0) {
      setSites(prev => {
        const map = new Map((prev || []).map(s => [s.code, s]));
        snap.sites.forEach(s => {
          if (!map.has(s.code)) map.set(s.code, s);
        });
        const merged = Array.from(map.values());
        try { localStorage.setItem('mdc_sites', JSON.stringify(merged)); } catch (e) {}
        return merged;
      });
    }

    let restoredCountDesc = [];

    // 3. Restore Forecast items if requested & present
    if (options.restoreForecast && snap.forecastItems && snap.forecastItems.length > 0) {
      setForecastItems(snap.forecastItems);
      try {
        localStorage.setItem('mdc_forecast', JSON.stringify(snap.forecastItems));
      } catch (e) {}
      restoredCountDesc.push(`${snap.forecastItems.length} forecasts`);
    }

    // 4. Restore Allocations if requested & present
    if (options.restoreAllocation && snap.allocations && snap.allocations.length > 0) {
      setAllocations(snap.allocations);
      try {
        localStorage.setItem('mdc_allocations', JSON.stringify(snap.allocations));
      } catch (e) {}
      restoredCountDesc.push(`${snap.allocations.length} allocations`);
    }

    const descStr = restoredCountDesc.length > 0 ? ` (${restoredCountDesc.join(', ')})` : '';
    showToast(`Loaded record "${record.period_label}" into live working tables${descStr}!`, 'success');

    // Automatically navigate to appropriate page
    if (options.restoreForecast && !options.restoreAllocation) {
      setActiveTab('forecast');
    } else if (options.restoreAllocation && !options.restoreForecast) {
      setActiveTab('allocation');
    } else if (snap.forecastItems && snap.forecastItems.length > 0) {
      setActiveTab('forecast');
    } else if (snap.allocations && snap.allocations.length > 0) {
      setActiveTab('allocation');
    }

    return { success: true };
  };

  // 3. Delete a Historical Saved Record
  const deletePeriodRecord = async (recordId) => {
    const record = savedRecords.find(r => r.id === recordId);
    if (!record) {
      return { success: false, error: 'Record not found' };
    }

    const nextList = savedRecords.filter(r => r.id !== recordId);
    setSavedRecords(nextList);

    try {
      localStorage.setItem('mdc_saved_records', JSON.stringify(nextList.slice(0, 50)));
    } catch (e) {
      console.warn('LocalStorage delete error:', e);
    }

    if (supabase) {
      try {
        await supabase.from('saved_records').delete().eq('id', recordId);
      } catch (dbErr) {
        console.warn('Supabase delete saved_record notice:', dbErr.message);
      }
    }

    showToast(`Permanently deleted record "${record.period_label}"`, 'info');
    return { success: true };
  };

  return (
    <AppContext.Provider
      value={{
        // Nav & Filters
        activeTab,
        setActiveTab,
        selectedCategory,
        setSelectedCategory,
        searchQuery,
        setSearchQuery,
        toast,
        showToast,
        // Auth & RBAC
        currentUser,
        usersList,
        pendingFirstTimeUser,
        setPendingFirstTimeUser,
        canAccess,
        verifyLoginEmail,
        signInWithPassword,
        createFirstTimePassword,
        signOut,
        provisionUser,
        updateUser,
        deleteUser,
        toggleUserPagePermission,
        applyRolePresetToUser,
        toggleUserActiveStatus,
        // Data Stores
        categories,
        sites,
        parts,
        forecastItems,
        allocations,
        inventoryUnits,
        purchaseOrders,
        shipments,
        scanLogs,
        repairUsageRecords,
        savedRecords,
        savePeriodRecord,
        restorePeriodRecord,
        deletePeriodRecord,
        addScanInUnit,
        batchAddScanInUnits,
        addScanOutUnit,
        batchAddScanOutUnits,
        clearShipmentDraftItems,
        batchImportShipments,
        clearAllShipmentsData,
        saveShipment,
        updateForecastOverride,
        updateSiteAllocation,
        runAutoAllocation,
        savePart,
        saveSite,
        applyParsedDataset,
        syncAllDataToCloud,
        resetToDefaultData,
        clearAllData
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
