import { Button as BaseButton } from '@base-ui/react/button';
import { clsx } from 'clsx';
import type { ComponentProps } from 'react';

/** Shared shadcn-style primitive, backed by Base UI's accessible button. */
export function Button({
  className,
  variant = 'primary',
  ...props
}: ComponentProps<typeof BaseButton> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <BaseButton className={clsx('button', `button-${variant}`, className)} {...props} />;
}
