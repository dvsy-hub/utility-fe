import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ScreenProps {
  readonly children: ReactNode;
  /** Vertically centers content — for status/empty states. */
  readonly centered?: boolean;
  readonly className?: string;
}

/** Root layout for a full screen; respects Telegram safe areas and the stable viewport height. */
export function Screen({ children, centered = false, className }: ScreenProps) {
  return (
    <main
      className={cn('mx-auto flex tg-screen w-full max-w-xl flex-col gap-6', centered && 'justify-center', className)}
    >
      {children}
    </main>
  );
}
