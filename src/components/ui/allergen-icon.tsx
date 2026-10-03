import {
  Bean,
  Droplet,
  Egg,
  Fish,
  Flower2,
  Leaf,
  Milk,
  Nut,
  Shell,
  Shrimp,
  Sprout,
  Wheat,
  Wine,
  type LucideIcon,
} from "lucide-react";

const ALLERGEN_ICONS: Record<string, LucideIcon> = {
  wheat: Wheat,
  shrimp: Shrimp,
  egg: Egg,
  fish: Fish,
  nut: Nut,
  bean: Bean,
  milk: Milk,
  leaf: Leaf,
  droplet: Droplet,
  seed: Sprout,
  wine: Wine,
  flower: Flower2,
  shell: Shell,
};

export function AllergenIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ALLERGEN_ICONS[name] ?? Droplet;
  return <Icon className={className} aria-hidden="true" strokeWidth={1.8} />;
}
