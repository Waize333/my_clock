"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, Plus, Waves } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import {
  clearPrivateCache,
  knownProfiles,
  type KnownProfile,
} from "@/lib/profiles";
export function ProfileChooser({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [profiles, setProfiles] = useState<KnownProfile[]>([]);
  const [busy, setBusy] = useState(connected);
  const [error, setError] = useState("");
  useEffect(() => {
    setProfiles(knownProfiles());
    if (connected)
      void authClient
        .signOut()
        .then(({ error }) => {
          if (error)
            setError(
              "Could not lock the previous profile. Please reload before sharing this device.",
            );
          else clearPrivateCache();
          setBusy(false);
        })
        .catch(() => {
          setError("Could not lock the previous profile. Please reload.");
          setBusy(false);
        });
  }, [connected]);
  async function select(profile: KnownProfile) {
    setBusy(true);
    setError("");
    try {
      if (connected) {
        const result = await authClient.signOut();
        if (result.error)
          throw new Error(
            "Could not lock the current profile. Please try again.",
          );
      }
      clearPrivateCache();
      router.push(`/login?profile=${encodeURIComponent(profile.id)}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
      setBusy(false);
    }
  }
  return (
    <main className="profile-page">
      <Link href="/" className="brand">
        <Waves size={28} />
        cadence.
      </Link>
      <div className="profile-content">
        <div className="eyebrow">YOUR OWN LITTLE SPACE</div>
        <h1>Who’s finding their rhythm?</h1>
        <p>Choose your profile. Leave the rest of the world outside.</p>
        <div className="profile-grid">
          {profiles.map((profile, index) => (
            <button
              key={profile.id}
              className="profile-tile"
              disabled={busy}
              onClick={() => void select(profile)}
            >
              <span className={`profile-avatar avatar-${index % 3}`}>
                {profile.name.slice(0, 1).toUpperCase()}
              </span>
              <strong>{profile.name}</strong>
              <span className="profile-lock">
                <LockKeyhole size={12} />
                Password protected
              </span>
              <ArrowRight size={17} />
            </button>
          ))}
          <Link href="/signup" className="profile-tile new-profile">
            <span className="profile-avatar">
              <Plus size={27} strokeWidth={1.4} />
            </span>
            <strong>Create a profile</strong>
            <span>A fresh space, just for you</span>
          </Link>
        </div>
        {profiles.length === 0 && (
          <p className="profile-empty">
            Profiles you use on this device will appear here.
          </p>
        )}
        <div className="profile-actions">
          <Link href="/login">
            Use an existing account
            <ArrowRight size={14} />
          </Link>
          {!connected && (
            <Link href="/dashboard/local/timer">
              Try the local preview
              <ArrowRight size={14} />
            </Link>
          )}
        </div>
        <p className="privacy-note">
          <LockKeyhole size={13} />
          Your timer, history, and preferences stay behind your password.
        </p>
        {error && (
          <p role="alert" className="error-banner">
            {error}
          </p>
        )}
      </div>
      <span className="auth-footer">
        A little structure. A little more space.
      </span>
    </main>
  );
}
