import { LoaderCircleIcon } from 'lucide-react';
import { cn } from 'cn';

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <LoaderCircleIcon
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
