export default function Textarea({ className = '', ...props }) {
  const classes = ['m-textarea', className].filter(Boolean).join(' ');
  return <textarea className={classes} {...props} />;
}
