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
        <div className="eyebrow">A LITTLE SPACE FOR YOU</div>
        <h1>
          {signup
            ? "Find your own rhythm."
            : name
              ? `Welcome back, ${name}.`
              : "Welcome back."}
        </h1>
        <p>
          {signup
            ? "Make room for focused work and restful pauses."
            : "Your quiet space is right where you left it."}
        </p>
        {!connected ? (
          <div className="local-auth">
            <p>
              Neon isn’t configured yet. Explore Cadence with real timer data
              saved in this browser.
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
            <form onSubmit={submit}>
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
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete={signup ? "new-password" : "current-password"}
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    signup ? "At least 8 characters" : "Your password"
                  }
                />
              </label>
              <button className="primary-button" disabled={busy}>
                {busy
                  ? "One moment…"
                  : signup
                    ? "Create your profile"
                    : "Sign in"}
                <ArrowRight size={16} />
              </button>
            </form>
            <p className="auth-switch">
              {signup ? "Already have an account?" : "New to Cadence?"}{" "}
              <Link href={signup ? "/login" : "/signup"}>
                {signup ? "Sign in" : "Create an account"}
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
