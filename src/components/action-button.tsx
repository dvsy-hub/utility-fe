import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

type ActionButtonProps = ComponentProps<typeof Button> & {
  /** Disables the button and shows a spinner while an async action runs. */
  readonly loading?: boolean;
};

/** Full-width, touch-friendly primary action for Mini App screens. */
export function ActionButton({ loading = false, disabled, className, children, ...props }: ActionButtonProps) {
  return (
    <Button
      size="lg"
      className={cn('h-11 w-full text-base', className)}
      disabled={disabled === true || loading}
      // Keep focus on the button while it is busy (aria-disabled instead of native disabled).
      {...(loading ? { focusableWhenDisabled: true } : {})}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner data-icon="inline-start" aria-hidden="true" role={undefined} /> : null}
      {children}
    </Button>
  );
}
