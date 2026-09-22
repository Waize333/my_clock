"use client";
import { useEffect, useState } from "react";
import { knownProfiles, rememberProfile } from "@/lib/profiles";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Waves } from "lucide-react";
import { authClient } from "@/lib/auth/client";
export function AuthForm({
  signup = false,
  connected = false,
  googleEnabled = false,
}: {
  signup?: boolean;
  connected?: boolean;
  googleEnabled?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("profile");
    const known = knownProfiles().find((p) => p.id === id);
    if (known) {
      setEmail(known.email);
      setName(known.name);
    }
  }, []);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!connected) {
      router.push("/dashboard/local/timer");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = signup
        ? await authClient.signUp.email({
            email,
            password,
            name: name.trim() || email.split("@")[0],
          })
        : await authClient.signIn.email({ email, password });
      if (result.error)
        throw new Error(result.error.message || "Authentication failed");
      if (result.data?.user) {
        rememberProfile({
          id: result.data.user.id,
          name: result.data.user.name || name || email.split("@")[0],
          email,
        });
        router.push(`/dashboard/${result.data.user.id}/planner`);
        router.refresh();
      } else
        setMessage(
          "Check your email to confirm your account, then return here to sign in.",
        );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Authentication failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setMessage("");
    try {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/dashboard/me/timer",
      });
      if (error) setMessage(error.message || "Google sign-in failed");
    } catch {
      setMessage("Google sign-in could not connect. Please try again.");
    }
  }
  return (
    <main className="auth-page">
      <Link href="/" className="brand">
        <Waves size={28} />
        cadence.
      </Link>
      <div className="auth-card">
        <nav className="auth-mode" aria-label="Account options">
          <Link href="/login" aria-current={!signup ? "page" : undefined}>
            <strong>Log in</strong>
            <span>I have an account</span>
          </Link>
          <Link href="/signup" aria-current={signup ? "page" : undefined}>
            <strong>Create account</strong>
            <span>I’m new here</span>
          </Link>
        </nav>
        <div className="eyebrow">
          {signup ? "GET STARTED WITH CADENCE" : "YOUR ACCOUNT, YOUR SPACE"}
        </div>
        <h1>
          {signup
            ? "Create your account."
            : name
              ? `Welcome back, ${name}.`
              : "Log in to Cadence."}
        </h1>
        <p>
          {signup
            ? "Choose a profile name, enter your email, and create a password. Then you’re ready to plan your week."
            : "Enter the email and password you used to create your account to return to your planner."}
        </p>
        {!connected ? (
          <div className="local-auth">
            <p>
              Account access isn’t available on this version yet. You can try
              the planner without an account. Preview data stays in this browser
              and won’t sync across devices.
            </p>
            <Link className="primary-button" href="/dashboard/local/timer">
              Enter local preview
              <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <>
            {googleEnabled && (
              <>
                <button
                  className="google-button"
                  onClick={google}
                  type="button"
                >
                  Continue with Google
                </button>
                <div className="or-divider">or use your email</div>
              </>
            )}
            <form onSubmit={submit} aria-busy={busy}>
              {signup && (
                <label>
                  Profile name
                  <input
                    required
                    maxLength={80}
                    autoComplete="nickname"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="What should we call you?"
                  />
                </label>
              )}
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <div className="auth-password">
                <label htmlFor="account-password">
                  {signup ? "Create a password" : "Password"}
                </label>
                <div className="auth-password-input">
                  <input
                    id="account-password"
                    type={showPassword ? "text" : "password"}
                    aria-describedby={signup ? "password-hint" : undefined}
                    autoComplete={signup ? "new-password" : "current-password"}
                    minLength={signup ? 8 : undefined}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      signup ? "At least 8 characters" : "Your password"
                    }
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                {signup && (
                  <p id="password-hint" className="auth-hint">
                    Use at least 8 characters. You’ll use this password to log
                    in next time.
                  </p>
                )}
              </div>
              <button className="primary-button" disabled={busy}>
                {busy
                  ? signup
                    ? "Creating your account…"
                    : "Logging in…"
                  : signup
                    ? "Create account"
                    : "Log in"}
                <ArrowRight size={16} />
              </button>
            </form>
            <p className="auth-switch">
              {signup ? "Already signed up?" : "Don’t have an account yet?"}{" "}
              <Link href={signup ? "/login" : "/signup"}>
                {signup ? "Log in to your account" : "Create your account"}
              </Link>
            </p>
          </>
        )}
        {message && (
          <p role="status" className="auth-message">
            {message}
          </p>
        )}
      </div>
      <span className="auth-footer">
        A little structure. A little more space.
      </span>
    </main>
  );
}
