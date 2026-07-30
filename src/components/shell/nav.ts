import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Users,
  GitCompareArrows,
  MessagesSquare,
  ScrollText,
  Settings,
  Bell,
  Shuffle,
  ClipboardList,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  /** Show only to non-admin agents (e.g. their personal assignments view). */
  agentOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Building2 },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/leads/assignments", label: "Assignments", icon: Shuffle, adminOnly: true },
  { href: "/leads/my-assignments", label: "My Leads", icon: ClipboardList, agentOnly: true },
  { href: "/matching", label: "Matching", icon: GitCompareArrows },
  { href: "/oversight", label: "Oversight", icon: MessagesSquare, adminOnly: true },
  { href: "/notifications", label: "Notifications", icon: Bell, adminOnly: true },
  { href: "/audit", label: "Audit", icon: ScrollText, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];
