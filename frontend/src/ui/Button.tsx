import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = 'primary', type = 'button', className, ...rest }: ButtonProps) {
  const cls = ['btn', `btn--${variant}`, className].filter(Boolean).join(' ');
  // eslint-disable-next-line react/button-has-type
  return <button type={type} className={cls} {...rest} />;
}
