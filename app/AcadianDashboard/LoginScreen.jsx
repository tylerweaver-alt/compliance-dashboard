import React from "react";

const ACADIAN_LOGO_URL =
  "https://n6pab61oup.ucarecd.net/e7ce3686-8f73-4a32-a65b-3f32a6810b07/AcadianLogo.png";

export default function LoginScreen({
  email,
  setEmail,
  password,
  setPassword,
  loginError,
  handleLogin,
}) {
  return (
    <div className="login-page">
      {/* Centered login card */}
      <div className="login-card">
        {/* Top: logo / title */}
        <div className="login-header">
          {/* Small logo / pill area */}
          <div className="login-logo">
            <img
              src={ACADIAN_LOGO_URL}
              alt="Acadian Ambulance"
            />
          </div>

          <h1 className="login-title">
            Compliance Dashboard
          </h1>
        </div>

        {/* Form fields */}
        <div className="login-form">
          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              placeholder="om@acadian.com"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLogin();
              }}
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              placeholder="demo123"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLogin();
              }}
            />
          </div>

          {/* Error message (only shown when loginError has text) */}
          {loginError && (
            <div className="login-error">
              {loginError}
            </div>
          )}

          {/* Submit button */}
          <button
            type="button"
            className="login-submit"
            onClick={handleLogin}
          >
            Sign In
          </button>

          {/* Duo SSO button */}
          <button
            type="button"
            className="login-sso"
            onClick={() => alert('Duo SSO integration coming soon')}
          >
            Log in with Duo SSO
          </button>
        </div>

        {/* Demo credentials footer */}
        <div className="login-footer">
          <span>OM: om@acadian.com / demo123</span>
        </div>
      </div>
    </div>
  );
}
