import type { ReactNode } from "react";

/** Static (GitHub Pages) build: same pass-through root as `layout.tsx`. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
