"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import {
  deviceTimezone,
  emptyPlanner,
  validPlanner,
  type Planner,
} from "./planner";
export function usePlanner(owner: string | null) {
  const [planner, setPlanner] = useState<Planner>(emptyPlanner());
  const [plannerReady, setReady] = useState(false),
    [plannerBusy, setBusy] = useState(false),
    [plannerError, setError] = useState(""),
    [plannerSaved, setSaved] = useState(false);
  const revision = useRef(0),
    generation = useRef(0),
    saving = useRef(false);
  const reloadPlanner = useCallback(async () => {
    if (!owner) return;
    const current = ++generation.current;
    setReady(false);
    setError("");
    setSaved(false);
    try {
      let data: Planner;
      if (owner === "local") {
        const stored = JSON.parse(
          localStorage.getItem("cadence:planner:local") || "null",
        );
        if (stored && !validPlanner(stored))
          throw new Error("Could not read your saved planner.");
        data = stored || emptyPlanner(deviceTimezone());
        revision.current = 0;
      } else {
        const result = await api<{ data: Planner | null; revision: number }>(
          "/api/planner",
        );
        if (current !== generation.current) return;
        data = result.data || emptyPlanner(deviceTimezone());
        revision.current = result.revision;
      }
      if (current === generation.current) {
        setPlanner(data);
        setReady(true);
      }
    } catch (e) {
      if (current === generation.current)
        setError(e instanceof Error ? e.message : "Could not load planner.");
    }
  }, [owner]);
  useEffect(() => {
    void reloadPlanner();
    const requestGeneration = generation.current;
    return () => {
      generation.current = requestGeneration + 1;
    };
  }, [reloadPlanner]);
  const savePlanner = async (next: Planner) => {
    if (!plannerReady || saving.current)
      throw new Error("Please wait for your planner to finish saving.");
    if (!validPlanner(next))
      throw new Error("Check your task settings and timestamps.");
    const current = generation.current;
    saving.current = true;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      if (owner === "local")
        localStorage.setItem("cadence:planner:local", JSON.stringify(next));
      else {
        const result = await api<{ revision: number }>("/api/planner", {
          method: "PUT",
          body: JSON.stringify({ data: next, revision: revision.current }),
        });
        if (current !== generation.current) return;
        revision.current = result.revision;
      }
      setPlanner(next);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save planner.");
      throw e;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return {
    planner,
    plannerReady,
    plannerBusy,
    plannerError,
    plannerSaved,
    savePlanner,
    reloadPlanner,
  };
}
