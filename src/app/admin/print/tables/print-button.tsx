"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="min-h-11 rounded-xl bg-black px-4 font-bold text-white"
    >
      Печать
    </button>
  );
}
