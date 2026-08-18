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
  superadmin: ['dashboard', 'import', 'forecast', 'orders', 'scan-in', 'allocation', 'scan-out', 'shipments', 'audit', 'settings', 'user-access'],
  admin: ['dashboard', 'import', 'forecast', 'orders', 'allocation', 'shipments', 'audit', 'settings'],
  warehouse_staff: ['dashboard', 'scan-in', 'allocation', 'scan-out', 'shipments'],
  site_staff: ['dashboard', 'shipments'],
  management_viewer: ['dashboard', 'forecast', 'allocation', 'shipments', 'audit']
};

// Initial provisioned users for instant testing & demonstration
const INITIAL_USERS = [
  {
    id: 'usr-superadmin-zhon',
    email: 'zhon@mobilecare.com.ph',
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
    email: 'joshua@mobilecare.com.ph',
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
    email: 'anjo@mobilecare.com.ph',
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
    email: 'warehouse@mobilecare.com.ph',
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
    email: 'npm.service@mobilecare.com.ph',
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
    email: 'newuser@mobilecare.com.ph',
    fullName: 'Carlo Reyes (New Hire)',
    role: 'warehouse_staff',
    siteId: 'site-dc',
    hasSetPassword: false, // First time login flow trigger!
    passwordHash: null,
    isActive: true,
    permittedPages: ROLE_PRESETS.warehouse_staff
  }
];

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
    const saved = localStorage.getItem('mdc_users');
    return saved ? JSON.parse(saved) : INITIAL_USERS;
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
    if (currentUser.role === 'superadmin') return true;
    return currentUser.permittedPages?.includes(pageId) ?? false;
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

  // --- AUTH ACTIONS ---

  // 1. Verify Company Email during Login
  const verifyLoginEmail = async (rawEmail) => {
    const email = rawEmail.trim().toLowerCase();

    // Check in local state first
    let user = usersList.find(u => u.email.toLowerCase() === email);

    // If not found in local state, query Supabase profiles
    if (!user && supabase) {
      try {
        const { data: dbUser } = await supabase
          .from('profiles')
          .select('*')
          .ilike('email', email)
          .maybeSingle();

        if (dbUser) {
          const { data: dbPerms } = await supabase
            .from('user_page_permissions')
            .select('page_id')
            .eq('user_id', dbUser.id);

          const perms = dbPerms && dbPerms.length > 0
            ? dbPerms.map(p => p.page_id)
            : (ROLE_PRESETS[dbUser.role] || ROLE_PRESETS.warehouse_staff);

          user = {
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

          setUsersList(prev => [...prev.filter(u => u.id !== user.id && u.email.toLowerCase() !== email), user]);
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

    let user = usersList.find(u => u.email.toLowerCase() === cleanEmail);

    if (!user && supabase) {
      try {
        const { data: dbUser } = await supabase
          .from('profiles')
          .select('*')
          .ilike('email', cleanEmail)
          .maybeSingle();

        if (dbUser) {
          const { data: dbPerms } = await supabase
            .from('user_page_permissions')
            .select('page_id')
            .eq('user_id', dbUser.id);

          const perms = dbPerms && dbPerms.length > 0
            ? dbPerms.map(p => p.page_id)
            : (ROLE_PRESETS[dbUser.role] || ROLE_PRESETS.warehouse_staff);

          user = {
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

          setUsersList(prev => [...prev.filter(u => u.id !== user.id && u.email.toLowerCase() !== cleanEmail), user]);
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
        await supabase.auth.signInWithPassword({ email: cleanEmail, password });
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
  const createFirstTimePassword = async (email, newPassword) => {
    const cleanEmail = email.trim().toLowerCase();
    const userIndex = usersList.findIndex(u => u.email.toLowerCase() === cleanEmail);

    if (userIndex === -1) {
      return { success: false, error: 'User profile not found' };
    }

    // Try updating Supabase auth user & profile
    try {
      if (supabase) {
        await supabase.auth.updateUser({ password: newPassword });
        await supabase
          .from('profiles')
          .update({ has_set_password: true, updated_at: new Date().toISOString() })
          .ilike('email', cleanEmail);
      }
    } catch (e) {
      // Offline mode fallback
    }

    const updatedUser = {
      ...usersList[userIndex],
      hasSetPassword: true,
      passwordHash: newPassword
    };

    const newUsersList = [...usersList];
    newUsersList[userIndex] = updatedUser;
    setUsersList(newUsersList);

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
    setUsersList(prev => [...prev, newUser]);

    // Sync to Supabase PostgreSQL database
    if (supabase) {
      try {
        const { data: inserted, error: insErr } = await supabase
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

    setUsersList(prev => prev.filter(u => u.id !== userId));

    if (supabase) {
      try {
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
      return saved ? JSON.parse(saved) : seedData.categories;
    } catch {
      return seedData.categories;
    }
  });

  const [sites, setSites] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_sites');
      return saved ? JSON.parse(saved) : seedData.sites;
    } catch {
      return seedData.sites;
    }
  });

  const [parts, setParts] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_parts');
      return saved ? JSON.parse(saved) : seedData.parts;
    } catch {
      return seedData.parts;
    }
  });

  const [forecastItems, setForecastItems] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_forecast');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [allocations, setAllocations] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_allocations');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [inventoryUnits, setInventoryUnits] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_inventory');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [purchaseOrders, setPurchaseOrders] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_pos');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [shipments, setShipments] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_shipments');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [scanLogs, setScanLogs] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_scan_logs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [repairUsageRecords, setRepairUsageRecords] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_repair_usage');
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
  }, [categories, sites, parts, forecastItems, allocations, inventoryUnits, purchaseOrders, shipments, scanLogs, repairUsageRecords]);

  // Initial Supabase Hydration check on app mount
  useEffect(() => {
    const hydrateFromSupabase = async () => {
      if (!supabase) return;
      try {
        // 1. Hydrate User Profiles & Permissions from Supabase
        const { data: dbProfiles } = await supabase.from('profiles').select('*');
        if (dbProfiles && dbProfiles.length > 0) {
          const { data: dbPerms } = await supabase.from('user_page_permissions').select('*');

          setUsersList(prev => {
            const list = [...(prev || [])];
            dbProfiles.forEach(dbUser => {
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
            return list;
          });
        }

        // 2. Hydrate Parts Catalog from Supabase
        const { data: dbParts } = await supabase.from('parts').select('*');
        if (dbParts && dbParts.length > 0) {
          setParts(prev => {
            const map = new Map((prev || []).map(p => [p.part_number, p]));
            dbParts.forEach(p => map.set(p.part_number, { ...p, ...map.get(p.part_number) }));
            return Array.from(map.values());
          });
        }

        // 3. Hydrate Serialized Inventory from Supabase
        const { data: dbInventory } = await supabase.from('inventory_units').select('*');
        if (dbInventory && dbInventory.length > 0) {
          setInventoryUnits(prev => {
            const map = new Map((prev || []).map(u => [u.serial_number, u]));
            dbInventory.forEach(u => map.set(u.serial_number, { ...u, ...map.get(u.serial_number) }));
            return Array.from(map.values());
          });
        }
      } catch (e) {
        console.warn('Supabase initial fetch skipped (offline or unauthenticated):', e.message);
      }
    };
    hydrateFromSupabase();
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
        showToast(`Dynamic forecast matrix updated with ${payload.forecastItems?.length || 0} parts from "${sheetName}"!`, 'success');
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
        exchange_price: 80,
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
          await supabase.from('inventory_units').upsert([{
            id: newUnit.id,
            part_id: newUnit.part_id,
            serial_number: newUnit.serial_number,
            current_site_id: newUnit.current_site_id || 'site-dc',
            po_id: newUnit.po_id || null,
            status: newUnit.status || 'in_stock',
            box_number: newUnit.box_number || 1,
            received_at: newUnit.received_at,
            notes: newUnit.description || null
          }]);
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
          exchange_price: 80,
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
          if (newlyCreatedParts.length > 0) {
            await supabase.from('parts').upsert(
              newlyCreatedParts.map(p => ({
                id: p.id,
                part_number: p.part_number,
                description: p.description,
                category_id: p.category_id || 'cat-battery',
                iphone_model: p.iphone_model || 'iPhone',
                stocking_price: p.stocking_price || 100,
                exchange_price: p.exchange_price || 80,
                is_active: true
              }))
            );
          }

          await supabase.from('inventory_units').upsert(
            newUnits.map(u => ({
              id: u.id,
              part_id: u.part_id,
              serial_number: u.serial_number,
              current_site_id: u.current_site_id || 'site-dc',
              po_id: u.po_id || null,
              status: u.status || 'in_stock',
              box_number: u.box_number || 1,
              received_at: u.received_at,
              notes: u.description || null
            }))
          );
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
