'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Settings,
  Download,
  Play,
  GraduationCap,
} from 'lucide-react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/alumni', label: 'Alumni', icon: Users },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/scraper', label: 'Scraper', icon: Play },
  { href: '/export', label: 'Export', icon: Download },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-upn-dark text-white flex flex-col">
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <GraduationCap className="w-8 h-8 text-upn-red" />
          <div>
            <h1 className="font-bold text-lg">UPN Alumni</h1>
            <p className="text-xs text-gray-400">Informatika 2004-2026</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-upn-red text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center gap-3 px-4 py-3 text-gray-400">
          <Settings className="w-5 h-5" />
          <span>Settings</span>
        </div>
      </div>
    </aside>
  );
}
