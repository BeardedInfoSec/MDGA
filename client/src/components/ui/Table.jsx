export function TableWrap({ className = '', children }) {
  const classes = ['m-tableWrap', className].filter(Boolean).join(' ');
  return <div className={classes}>{children}</div>;
}

export default function Table({ className = '', children, ...props }) {
  const classes = ['m-table', className].filter(Boolean).join(' ');
  return <table className={classes} {...props}>{children}</table>;
}
