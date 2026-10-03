import {
  CakeSlice,
  CupSoda,
  Flame,
  Heart,
  Layers,
  Leaf,
  Martini,
  Mic,
  Salad,
  Sparkles,
  Star,
  Users,
  UtensilsCrossed,
  WheatOff,
  type LucideIcon,
} from "lucide-react";
import type { ItemFlag } from "@/lib/domain/types";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  salad: Salad,
  utensils: UtensilsCrossed,
  flame: Flame,
  layers: Layers,
  martini: Martini,
  cup: CupSoda,
  mic: Mic,
  cake: CakeSlice,
  heart: Heart,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = CATEGORY_ICONS[name] ?? UtensilsCrossed;
  return <Icon className={className} aria-hidden="true" strokeWidth={1.8} />;
}

export const FLAG_ICONS: Record<ItemFlag, LucideIcon> = {
  hit: Star,
  new: Sparkles,
  spicy: Flame,
  veg: Leaf,
  gf: WheatOff,
  share: Users,
};
