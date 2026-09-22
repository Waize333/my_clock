"use client";
import {
  Check,
  Coffee,
  Feather,
  Minus,
  Plus,
  SlidersHorizontal,
  X,
} from "lucide-react";
export function DurationEditor({
  work,
  rest,
  setWork,
  setRest,
  onClose,
}: {
  work: number;
  rest: number;
  setWork: (n: number) => void;
  setRest: (n: number) => void;
  onClose: () => void;
}) {
  const presets = [
    { name: "A small start", work: 25, rest: 5 },
    { name: "A steady rhythm", work: 50, rest: 10 },
    { name: "A deeper dive", work: 90, rest: 20 },
  ];
  return (
    <div className="pace-editor">
      <div className="pace-heading">
        <div>
          <SlidersHorizontal size={15} />
          <span>Set your pace</span>
        </div>
        <button
          className="icon-button"
          aria-label="Close duration editor"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      <div className="pace-presets">
        {presets.map((p) => (
          <button
            key={p.work}
            className={work === p.work && rest === p.rest ? "active" : ""}
            onClick={() => {
              setWork(p.work);
              setRest(p.rest);
            }}
            aria-pressed={work === p.work && rest === p.rest}
          >
            <strong>
              {p.work}
              <span> / {p.rest}</span>
            </strong>
            <span>{p.name}</span>
          </button>
        ))}
      </div>
      <div className="pace-custom">
        {[
          {
            label: "Focus",
            value: work,
            set: setWork,
            max: 180,
            step: 5,
            Icon: Feather,
          },
          {
            label: "Break",
            value: rest,
            set: setRest,
            max: 60,
            step: 1,
            Icon: Coffee,
          },
        ].map(({ label, value, set, max, step, Icon }) => (
          <div className="pace-field" key={label}>
            <label htmlFor={`pace-${label}`}>
              <Icon size={13} />
              {label}
              <span>min</span>
            </label>
            <div className="stepper">
              <button
                aria-label={`Decrease ${label.toLowerCase()} duration`}
                disabled={value <= 1}
                onClick={() => set(Math.max(1, value - step))}
              >
                <Minus size={15} />
              </button>
              <input
                id={`pace-${label}`}
                aria-label={`${label} duration`}
                type="number"
                min={1}
                max={max}
                value={value}
                onChange={(e) => set(Number(e.target.value))}
                onBlur={() =>
                  set(Math.max(1, Math.min(max, Math.round(value) || 1)))
                }
              />
              <button
                aria-label={`Increase ${label.toLowerCase()} duration`}
                disabled={value >= max}
                onClick={() => set(Math.min(max, value + step))}
              >
                <Plus size={15} />
              </button>
            </div>
            <input
              className="pace-range"
              aria-label={`${label} duration slider`}
              type="range"
              min={1}
              max={max}
              value={value}
              onChange={(e) => set(Number(e.target.value))}
            />
          </div>
        ))}
      </div>
      <button className="pace-done" onClick={onClose}>
        <Check size={14} />
        That feels right
      </button>
    </div>
  );
}
