"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  BarChart3,
  Clock3,
  CalendarDays,
  Moon,
  Settings2,
  Sun,
  Waves,
  LogOut,
} from "lucide-react";
import { reminderText } from "@/lib/timer/reminders";
import { useApp } from "./provider";
import { clearPrivateCache } from "@/lib/profiles";
import { authClient } from "@/lib/auth/client";
export function Shell({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [leaving, setLeaving] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  async function leave(destination = "/") {
    if (leaving) return;
    setLeaving(true);
    setLogoutError("");
    try {
      await app.pauseAndSync();
      if (app.connected) {
        const result = await authClient.signOut();
        if (result.error)
          throw new Error("Could not log out. Please try again.");
        clearPrivateCache();
      }
      router.replace(destination);
      router.refresh();
    } catch (error) {
      setLogoutError(
        error instanceof Error
          ? error.message
          : "Could not log out. Please try again.",
      );
      setLeaving(false);
    }
  }
  const reminderDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (app.reminder) reminderDialog.current?.showModal();
    else reminderDialog.current?.close();
  }, [app.reminder]);
  const base = `/dashboard/${app.profile.id}`;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="header">
        <Link
          href="/"
          className="brand"
          aria-label="Cadence home"
          onClick={(event) => {
            event.preventDefault();
            void leave();
          }}
        >
          <Waves size={26} strokeWidth={1.8} />
          <span>
            cadence<span className="brand-dot">.</span>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          {[
            { name: "Planner", path: "planner", Icon: CalendarDays },
            { name: "Timer", path: "timer", Icon: Clock3 },
            { name: "Insights", path: "stats", Icon: BarChart3 },
            { name: "Settings", path: "settings", Icon: Settings2 },
          ].map(({ name, path, Icon }) => (
            <Link
              key={path}
              className={`nav-link ${pathname.endsWith(path) ? "selected" : ""}`}
              href={`${base}/${path}`}
              aria-current={pathname.endsWith(path) ? "page" : undefined}
            >
              <Icon size={16} />
              <span>{name}</span>
            </Link>
          ))}
        </nav>
        <div className="header-right">
          <span className="local-pill">
            <i />
            {app.connected ? "Personal space" : "Local preview"}
          </span>
          <button
            className="icon-button"
            onClick={app.toggleTheme}
            aria-label={`Switch to ${app.theme === "dark" ? "light" : "dark"} theme`}
          >
            {app.theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          {app.connected && (
            <button
              className="icon-button"
              aria-label="Lock and switch profile"
              title="Lock and switch profile"
              disabled={leaving}
              onClick={() => void leave()}
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        {!app.connected && (
          <aside className="preview-notice">
            Local preview · saved only in this browser.{" "}
            <Link
              href="/login"
              onClick={(event) => {
                event.preventDefault();
                void leave("/login");
              }}
            >
              Sign in to sync across devices <ArrowUpRight size={13} />
            </Link>
          </aside>
        )}
        {logoutError && (
          <p role="alert" className="error-banner">
            {logoutError}
          </p>
        )}
        {app.accountError && (
          <div className="error-banner" role="alert">
            {app.accountError}
          </div>
        )}
        {app.error && (
          <div className="error-banner" role="alert">
            {app.error}
            {app.hasConflict && (
              <div className="conflict-actions">
                <button className="small-button" onClick={app.retrySync}>
                  Retry sync
                </button>
                <button className="small-button" onClick={app.exportBackup}>
                  Download browser copy
                </button>
                <button className="small-button" onClick={app.useCloudVersion}>
                  Use saved account version
                </button>
              </div>
            )}
          </div>
        )}
        {children}
      </main>
      <footer>
        <span>A little structure. A little more space.</span>
        <span className="footer-right">
          {app.connected
            ? "Your time, at your pace."
            : "Stored on this browser"}
          <ArrowUpRight size={13} />
        </span>
      </footer>
      <dialog
        ref={reminderDialog}
        className="reminder-dialog"
        aria-labelledby="reminder-heading"
        onCancel={(event) => {
          event.preventDefault();
          app.dismissReminder();
        }}
      >
        <span className="eyebrow">YOUR RHYTHM</span>
        <h2 id="reminder-heading">
          {app.reminder
            ? reminderText(app.reminder).title
            : "Interval complete"}
        </h2>
        <p>{app.reminder ? reminderText(app.reminder).body : ""}</p>
        <div className="reminder-actions">
          <button className="primary-button" onClick={app.dismissReminder}>
            Got it
          </button>
          {app.active?.running && (
            <button
              className="secondary-button"
              onClick={() => {
                app.action("pause");
                app.dismissReminder();
              }}
            >
              Pause timer
            </button>
          )}
        </div>
      </dialog>
      {app.connected && (
        <div className="progress-sync" aria-label="Progress sync status">
          <span>
            {app.syncStatus}
            {app.lastSynced
              ? ` · ${new Date(app.lastSynced).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </span>
          <button
            className="text-button"
            onClick={() => {
              void app.refreshProgress();
              window.dispatchEvent(new Event("cadence:refresh-planner"));
            }}
          >
            Sync now
          </button>
        </div>
      )}
      {app.notice && (
        <div className="toast" role="status">
          <span className="status-dot" />
          {app.notice}
        </div>
      )}
    </div>
  );
}
