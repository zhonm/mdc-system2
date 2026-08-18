import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ShieldCheck, Lock, CheckCircle2, XCircle, Eye, EyeOff, ArrowRight, RefreshCw, Sparkles } from 'lucide-react';

export default function CreatePassword() {
  const { pendingFirstTimeUser, setPendingFirstTimeUser, createFirstTimePassword, showToast } = useApp();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!pendingFirstTimeUser) {
    return null;
  }

  // Password Policy Rules
  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const isMatch = password.length > 0 && password === confirmPassword;
  const isFormValid = hasMinLength && hasLetter && hasNumber && isMatch;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid) {
      setErrorMessage('Please fulfill all security requirements before proceeding.');
      return;
    }

    setErrorMessage('');
    setIsLoading(true);

    try {
      const res = await createFirstTimePassword(pendingFirstTimeUser.email, password);
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to initialize password');
      }
    } catch (err) {
      setErrorMessage(err.message || 'An error occurred setting password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at center, #0f172a 0%, #020617 100%)',
        padding: '24px'
      }}
    >
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <div className="scanner-hero" style={{ padding: '36px 32px' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div
              style={{
                width: '50px',
                height: '50px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                borderRadius: 'var(--radius-md)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                marginBottom: '12px',
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)'
              }}
            >
              <Sparkles size={24} />
            </div>

            <div className="scanner-status-indicator" style={{ display: 'inline-flex', marginBottom: '8px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
              <div className="pulse-dot" style={{ background: '#34d399' }} />
              <span>First-Time Account Activation</span>
            </div>

            <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 600 }}>
              Create Your Password
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '2px' }}>
              Welcome, <strong style={{ color: '#f1f5f9' }}>{pendingFirstTimeUser.fullName}</strong> ({pendingFirstTimeUser.email})
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            {/* New Password */}
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="scanner-field-label">New Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="scanner-input"
                  placeholder="Create a secure password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer'
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="scanner-field-label">Confirm Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                className="scanner-input"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            {/* Security Checklist */}
            <div style={{ background: '#1e293b', borderRadius: 'var(--radius-sm)', padding: '14px', marginBottom: '24px', border: '1px solid #334155' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>
                Security Requirements:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasMinLength ? '#34d399' : '#94a3b8' }}>
                  {hasMinLength ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  <span>8+ characters</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasLetter ? '#34d399' : '#94a3b8' }}>
                  {hasLetter ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  <span>At least 1 letter</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasNumber ? '#34d399' : '#94a3b8' }}>
                  {hasNumber ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  <span>At least 1 number</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isMatch ? '#34d399' : '#94a3b8' }}>
                  {isMatch ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  <span>Passwords match</span>
                </div>
              </div>
            </div>

            {errorMessage && (
              <div className="scanner-feedback-box scanner-feedback-error" style={{ marginBottom: '20px' }}>
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', height: '50px', background: isFormValid ? 'var(--primary)' : '#475569' }}
              disabled={!isFormValid || isLoading}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="animate-spin" size={17} />
                  <span>Activating Account...</span>
                </>
              ) : (
                <>
                  <span>Save Password & Log In</span>
                  <ArrowRight size={17} />
                </>
              )}
            </button>

            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => setPendingFirstTimeUser(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '12.5px', cursor: 'pointer' }}
              >
                Back to Login
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
