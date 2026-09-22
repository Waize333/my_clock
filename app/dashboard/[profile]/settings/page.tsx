"use client";
import { useEffect, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useApp, type Profile } from "@/components/provider";
export default function SettingsPage() {
  const app = useApp();
  const [values, setValues] = useState(app.profile);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setValues(app.profile), [app.profile]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await app.updateProfile(values);
      setMessage("Your preferences have been saved.");
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
            Start here. Adjust for the day whenever you need.
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
            Give your eyes a comfortable place to settle.
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
