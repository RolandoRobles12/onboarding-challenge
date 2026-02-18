'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Swords, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  if (isAdmin) return null;

  const tabs = [
    { href: '/', label: 'Inicio', icon: Home },
    { href: '/challenges', label: 'Práctica', icon: Swords },
    { href: '/perfil', label: 'Mi Perfil', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur border-t shadow-lg">
      <div className="max-w-md mx-auto flex">
        {tabs.map(tab => {
          const active = pathname === tab.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className={cn('h-5 w-5 transition-all', active && 'scale-110')} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
