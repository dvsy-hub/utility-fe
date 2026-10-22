import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatusViewProps {
  readonly title: string;
  readonly description?: string;
  /** Icon or spinner shown above the title. */
  readonly icon?: ReactNode;
  /** Buttons, stacked vertically. */
  readonly actions?: ReactNode;
  readonly tone?: 'neutral' | 'error';
  readonly children?: ReactNode;
}

/** Title + description + actions block for loading, empty, success and error states. */
export function StatusView({ title, description, icon, actions, tone = 'neutral', children }: StatusViewProps) {
  const isError = tone === 'error';
  return (
    <section
      className="flex flex-col items-center gap-3 text-center"
      role={isError ? 'alert' : undefined}
      aria-live={isError ? undefined : 'polite'}
    >
      {icon === undefined ? null : (
        <div
          className={cn(
            'mb-2 flex size-16 items-center justify-center rounded-full bg-secondary [&_svg]:size-8',
            isError ? 'text-destructive' : 'text-primary',
          )}
        >
          {icon}
        </div>
      )}
      <h1 className={cn('text-2xl font-semibold tracking-tight text-balance', isError && 'text-destructive')}>
        {title}
      </h1>
      {description === undefined ? null : <p className="max-w-sm text-balance text-muted-foreground">{description}</p>}
      {children}
      {actions === undefined ? null : <div className="mt-4 flex w-full max-w-sm flex-col gap-2">{actions}</div>}
    </section>
  );
}
