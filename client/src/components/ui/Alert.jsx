export default function Alert({ tone = 'info', className = '', children, ...props }) {
  const toneClass = tone ? `m-alert--${tone}` : '';
  const classes = ['m-alert', toneClass, className].filter(Boolean).join(' ');
  return <div className={classes} {...props}>{children}</div>;
}
