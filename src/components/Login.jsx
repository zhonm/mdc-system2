import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Lock, ArrowRight, Eye, EyeOff, AlertCircle, RefreshCw } from 'lucide-react';

export default function Login() {
  const { verifyLoginEmail, signInWithPassword, setPendingFirstTimeUser, showToast } = useApp();
  
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState('email'); // 'email' | 'password'
  const [verifiedUser, setVerifiedUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showForgotModal, setShowForgotModal] = useState(false);

  // Handle Email Verification Step
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!emailInput.trim()) {
      setErrorMessage('Please enter your company email address');
      return;
    }

    setErrorMessage('');
    setIsLoading(true);

    try {
      const check = await verifyLoginEmail(emailInput);
      if (!check.success) {
        setErrorMessage(check.error);
        setIsLoading(false);
        return;
      }

      if (!check.hasSetPassword) {
        // First-time login! Route to CreatePassword screen
        setPendingFirstTimeUser(check.user);
      } else {
        // Returning user: reveal password step
        setVerifiedUser(check.user);
        setStep('password');
      }
    } catch (err) {
      setErrorMessage(err.message || 'An error occurred during verification');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Password Submit Step
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!passwordInput) {
      setErrorMessage('Please enter your password');
      return;
    }

    setErrorMessage('');
    setIsLoading(true);

    try {
      const res = await signInWithPassword(emailInput, passwordInput);
      if (!res.success) {
        setErrorMessage(res.error);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Authentication failed');
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
      <div style={{ width: '100%', maxWidth: '460px' }}>
        {/* Auth Hero Card */}
        <div className="scanner-hero" style={{ padding: '36px 32px', marginBottom: '20px' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div
              style={{
                width: '54px',
                height: '54px',
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                borderRadius: 'var(--radius-md)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 700,
                fontSize: '22px',
                marginBottom: '12px',
                boxShadow: '0 0 20px rgba(2, 132, 199, 0.4)'
              }}
            >
              M
            </div>
            <div className="scanner-status-indicator" style={{ display: 'inline-flex', marginBottom: '8px' }}>
              <div className="pulse-dot" />
              <span>MDC System 2 • Secure Portal</span>
            </div>
            <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 600 }}>
              MOBILE CARE SERVICES PHILS. INC.
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '2px' }}>
              Distribution Center Parts Allocation & Reporting
            </p>
          </div>

          {/* Form */}
          {step === 'email' ? (
            <form onSubmit={handleEmailSubmit}>
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="scanner-field-label">Company Email</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="email"
                    className="scanner-input"
                    placeholder="e.g. name@mobilecare.com.ph"
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      if (errorMessage) setErrorMessage('');
                    }}
                    autoFocus
                    required
                  />
                </div>
              </div>

              {errorMessage && (
                <div
                  className="scanner-feedback-box scanner-feedback-error"
                  style={{ marginBottom: '20px', padding: '10px 14px' }}
                >
                  <AlertCircle size={17} color="#ef4444" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '13px' }}>{errorMessage}</span>
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-lg"
                style={{ width: '100%', height: '50px' }}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="animate-spin" size={17} />
                    <span>Checking Provisioning...</span>
                  </>
                ) : (
                  <>
                    <span>Continue with Email</span>
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handlePasswordSubmit}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', color: '#cbd5e1' }}>
                  Signing in as: <strong style={{ color: '#38bdf8' }}>{verifiedUser?.email}</strong>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep('email');
                    setPasswordInput('');
                    setErrorMessage('');
                  }}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Change
                </button>
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="scanner-field-label" style={{ marginBottom: 0 }}>Password</label>
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(true)}
                    style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Forgot Password?
                  </button>
                </div>
                <div style={{ position: 'relative', marginTop: '6px' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="scanner-input"
                    placeholder="Enter your password"
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      if (errorMessage) setErrorMessage('');
                    }}
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

              {errorMessage && (
                <div
                  className="scanner-feedback-box scanner-feedback-error"
                  style={{ marginBottom: '20px', padding: '10px 14px' }}
                >
                  <AlertCircle size={17} color="#ef4444" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '13px' }}>{errorMessage}</span>
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-lg"
                style={{ width: '100%', height: '50px' }}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="animate-spin" size={17} />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <Lock size={17} />
                    <span>Log In to MDC System 2</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
        >
          <div className="card" style={{ maxWidth: '420px', width: '100%', background: '#0f172a', color: '#fff', borderColor: '#334155' }}>
            <h3 style={{ color: '#fff', marginBottom: '8px' }}>Reset Password</h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '20px' }}>
              For security, password resets for authorized service staff are administered by your IT Superadmin or via standard Supabase recovery tokens.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn btn-secondary" onClick={() => setShowForgotModal(false)}>
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  showToast('Password reset assistance notification logged for Superadmin.', 'info');
                  setShowForgotModal(false);
                }}
              >
                Request IT Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
