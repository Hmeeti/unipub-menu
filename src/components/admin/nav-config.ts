import {
  BarChart3,
  ClipboardList,
  FolderTree,
  History,
  LayoutDashboard,
  Megaphone,
  QrCode,
  ScrollText,
  Server,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { hasRole } from "@/lib/admin/roles";
import type { AdminRole } from "@/lib/db/schema";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  min: AdminRole;
  primary?: boolean;
};

export const NAV: NavItem[] = [
  { href: "/admin", label: "Сводка", icon: LayoutDashboard, min: "waiter", primary: true },
  { href: "/admin/menu", label: "Блюда", icon: UtensilsCrossed, min: "manager", primary: true },
  { href: "/admin/orders", label: "Заказы", icon: ClipboardList, min: "waiter", primary: true },
  { href: "/admin/publish", label: "Публикация", icon: History, min: "manager" },
  { href: "/admin/categories", label: "Категории", icon: FolderTree, min: "manager" },
  { href: "/admin/promotions", label: "Акции", icon: Megaphone, min: "manager" },
  { href: "/admin/places", label: "Залы и столы", icon: QrCode, min: "manager" },
  { href: "/admin/staff", label: "Официанты", icon: Users, min: "manager" },
  { href: "/admin/analytics", label: "Аналитика", icon: BarChart3, min: "manager" },
  { href: "/admin/settings", label: "Заведение", icon: Settings, min: "manager" },
  { href: "/admin/system", label: "Бот и очередь", icon: Server, min: "manager" },
  { href: "/admin/audit", label: "Журнал действий", icon: ScrollText, min: "owner" },
  { href: "/admin/users", label: "Пользователи", icon: ShieldCheck, min: "owner" },
  { href: "/admin/account", label: "Мой аккаунт", icon: UserRound, min: "waiter" },
];

export function visibleNav(role: AdminRole) {
  return NAV.filter((n) => hasRole(role, n.min));
}
