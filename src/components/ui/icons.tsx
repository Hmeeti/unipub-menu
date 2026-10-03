import {
  Beef,
  Beer,
  CakeSlice,
  Coffee,
  CupSoda,
  Drumstick,
  Fish,
  Flame,
  Heart,
  IceCreamCone,
  Layers,
  Leaf,
  Martini,
  Mic,
  Pizza,
  Salad,
  Sandwich,
  Soup,
  Sparkles,
  Star,
  Users,
  UtensilsCrossed,
  WheatOff,
  Wine,
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
  soup: Soup,
  pizza: Pizza,
  beef: Beef,
  fish: Fish,
  drumstick: Drumstick,
  sandwich: Sandwich,
  coffee: Coffee,
  beer: Beer,
  wine: Wine,
  "ice-cream": IceCreamCone,
};

/** Choices offered in the admin category editor ("heart" is reserved for favourites). */
export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS).filter((k) => k !== "heart");

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
