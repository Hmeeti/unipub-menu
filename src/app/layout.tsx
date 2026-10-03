import type { ReactNode } from "react";

/**
 * Pass-through root: `[locale]/layout.tsx` (guest menu) and `admin/layout.tsx` render their own
 * <html> with different languages, fonts and providers.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
