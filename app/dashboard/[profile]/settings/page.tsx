"use client";
import { useEffect, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { enableNotifications } from "@/lib/timer/reminders";
import { useApp, type Profile } from "@/components/provider";
export default function SettingsPage() {
  const app = useApp();
  const [values, setValues] = useState(app.profile);
  const [reminders, setReminders] = useState(app.deviceSettings.reminders);
  useEffect(
    () => setReminders(app.deviceSettings.reminders),
    [app.deviceSettings.reminders],
  );
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setValues(app.profile), [app.profile]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await app.updateProfile(values);
      app.updateDeviceSettings({ reminders });
      setMessage(
        "Your account name and this device’s preferences have been saved.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Could not save preferences.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="content-page settings-page">
      <div className="eyebrow">MAKE YOURSELF AT HOME</div>
      <h1>A rhythm that fits you.</h1>
      <p className="page-description">
        A few simple preferences for your personal space.
      </p>
      <form onSubmit={submit}>
        <section className="panel">
          <h2>Your profile</h2>
          <p className="section-copy">
            {app.connected
              ? "Only you can see and edit your account."
              : "Local preview · preferences are saved in this browser."}
          </p>
          <div className="form-grid">
            <label>
              Display name
              <input
                maxLength={80}
                value={values.display_name || ""}
                placeholder="What should we call you?"
                onChange={(e) =>
                  setValues({ ...values, display_name: e.target.value })
                }
              />
            </label>
            <label>
              Username
              <input
                required
                minLength={3}
                maxLength={40}
                pattern="[a-zA-Z0-9_-]+"
                value={values.username}
                onChange={(e) =>
                  setValues({ ...values, username: e.target.value })
                }
              />
            </label>
          </div>
        </section>
        <section className="panel">
          <h2>Your default session</h2>
          <p className="section-copy">
            Saved only on this device. Other devices can use different
            durations.
          </p>
          <div className="form-grid">
            <label>
              Focus duration <span>minutes</span>
              <input
                type="number"
                min={1}
                max={180}
                required
                value={values.default_work_min}
                onChange={(e) =>
                  setValues({
                    ...values,
                    default_work_min: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Break duration <span>minutes</span>
              <input
                type="number"
                min={1}
                max={60}
                required
                value={values.default_break_min}
                onChange={(e) =>
                  setValues({
                    ...values,
                    default_break_min: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
        </section>
        <section className="panel">
          <h2>Appearance</h2>
          <p className="section-copy">
            Choose a theme for this device. Your other devices keep their own
            theme.
          </p>
          <div className="theme-options">
            {[
              { id: "light", title: "Light", Icon: Sun },
              { id: "dark", title: "Dark", Icon: Moon },
              { id: "system", title: "System", Icon: Monitor },
            ].map(({ id, title, Icon }) => (
              <button
                type="button"
                key={id}
                aria-pressed={values.theme_pref === id}
                className={values.theme_pref === id ? "active" : ""}
                onClick={() =>
                  setValues({
                    ...values,
                    theme_pref: id as Profile["theme_pref"],
                  })
                }
              >
                <Icon size={20} />
                {title}
                {values.theme_pref === id && <Check size={14} />}
              </button>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>Reminders on this device</h2>
          <p className="section-copy">
            Choose how you’re reminded when work ends and when your break ends.
            Keep Cadence open; browsers can delay alerts when suspended.
          </p>
          <div className="reminder-options">
            {(
              [
                { key: "sound", label: "Play a sound" },
                { key: "popup", label: "Show an in-app popup" },
                { key: "vibration", label: "Vibrate (supported phones)" },
                { key: "notifications", label: "Show browser notifications" },
              ] as const
            ).map(({ key, label }) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={reminders[key]}
                  onChange={(event) =>
                    setReminders({ ...reminders, [key]: event.target.checked })
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <label className="reminder-volume">
            Sound volume · {Math.round(reminders.volume * 100)}%
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={reminders.volume}
              onChange={(event) =>
                setReminders({
                  ...reminders,
                  volume: Number(event.target.value),
                })
              }
            />
          </label>
          <div className="reminder-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                app.testReminder("break", reminders);
              }}
            >
              Test work-end reminder
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => app.testReminder("work", reminders)}
            >
              Test break-end reminder
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                void enableNotifications()
                  .then((message) => {
                    setMessage(message);
                    if (
                      "Notification" in window &&
                      Notification.permission === "granted"
                    )
                      setReminders((previous) => ({
                        ...previous,
                        notifications: true,
                      }));
                  })
                  .catch(() =>
                    setMessage(
                      "Could not enable notifications. Please try again.",
                    ),
                  );
              }}
            >
              Allow browser notifications
            </button>
          </div>
          <p className="section-copy">
            Vibration and browser notifications depend on your browser, device
            permissions, and system settings. In-app popups work while Cadence
            is open.
          </p>
        </section>
        <div className="save-row">
          <p role="status">{message}</p>
          <button
            className="primary-button"
            disabled={saving || !app.accountReady}
          >
            {saving ? "Saving…" : "Save preferences"}
          </button>
        </div>
      </form>
    </div>
  );
}
