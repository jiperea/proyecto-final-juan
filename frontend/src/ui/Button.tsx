import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', type = 'button', className, ...rest },
  ref,
) {
  const cls = ['btn', `btn--${variant}`, className].filter(Boolean).join(' ');
  // eslint-disable-next-line react/button-has-type
  return <button ref={ref} type={type} className={cls} {...rest} />;
});
