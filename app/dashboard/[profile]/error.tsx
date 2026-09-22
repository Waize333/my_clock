"use client";
import Link from "next/link";
export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <div className="page-loading" role="alert">
      <h2>This page couldn’t load.</h2>
      <p>Try opening it again. Your saved work is still there.</p>
      <button className="primary-button" onClick={reset}>
        Try again
      </button>
      <Link className="text-button" href="/">
        Return to profiles
      </Link>
    </div>
  );
}
