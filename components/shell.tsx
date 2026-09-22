"use client";
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
import { useApp } from "./provider";
import { clearPrivateCache } from "@/lib/profiles";
import { authClient } from "@/lib/auth/client";
export function Shell({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const base = `/dashboard/${app.profile.id}`;
  return (
    <div className="app-shell">
      <header className="header">
        <Link href="/" className="brand" aria-label="Cadence home">
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
              onClick={() => {
                void authClient.signOut().then(({ error }) => {
                  if (!error) {
                    clearPrivateCache();
                    router.replace("/");
                    router.refresh();
                  }
                });
              }}
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </header>
      <main>
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
      {app.notice && (
        <div className="toast" role="status">
          <span className="status-dot" />
          {app.notice}
        </div>
      )}
    </div>
  );
}
