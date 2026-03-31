import { Link } from 'react-router-dom';

function buildClassName({ variant, size, block, className }) {
  return [
    'm-btn',
    `m-btn--${variant}`,
    size !== 'md' ? `m-btn--${size}` : '',
    block ? 'm-btn--full' : '',
    className || '',
  ].filter(Boolean).join(' ');
}

export default function Button({
  to,
  href,
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
  loading = false,
  disabled = false,
  ...rest
}) {
  const classes = buildClassName({ variant, size, block, className });
  const computedDisabled = disabled || loading;

  if (to) {
    return (
      <Link to={to} className={classes} aria-disabled={computedDisabled} {...rest}>
        {children}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={classes} aria-disabled={computedDisabled} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <button className={classes} disabled={computedDisabled} {...rest}>
      {children}
    </button>
  );
}
