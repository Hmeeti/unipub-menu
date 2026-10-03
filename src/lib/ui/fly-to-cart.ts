import { prefersReducedMotion } from "@/lib/utils";

export const CART_TARGET_ID = "cart-bar";

/** Small dot flying from the "+" button to the cart bar (WAAPI, no animation library). */
export function flyToCart(from: HTMLElement) {
  if (prefersReducedMotion() || typeof document.body.animate !== "function") return;
  const a = from.getBoundingClientRect();
  const target = document.getElementById(CART_TARGET_ID);
  const b = target
    ? target.getBoundingClientRect()
    : new DOMRect(window.innerWidth / 2, window.innerHeight - 48, 0, 0);
  const dot = document.createElement("div");
  dot.setAttribute("aria-hidden", "true");
  dot.style.cssText =
    "position:fixed;z-index:70;width:14px;height:14px;border-radius:50%;pointer-events:none;" +
    `left:${a.left + a.width / 2 - 7}px;top:${a.top + a.height / 2 - 7}px;` +
    "background:var(--pink);box-shadow:0 0 16px var(--pink);";
  document.body.appendChild(dot);
  const dx = b.left + Math.min(b.width, 80) / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const anim = dot.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      {
        transform: `translate(${dx * 0.6}px,${dy * 0.35 - 60}px) scale(0.9)`,
        opacity: 1,
        offset: 0.5,
      },
      { transform: `translate(${dx}px,${dy}px) scale(0.4)`, opacity: 0.2 },
    ],
    { duration: 520, easing: "cubic-bezier(0.22,1,0.36,1)" },
  );
  anim.onfinish = () => dot.remove();
  anim.oncancel = () => dot.remove();
}
