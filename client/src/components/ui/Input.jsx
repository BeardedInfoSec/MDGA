import { forwardRef } from 'react';

const Input = forwardRef(function Input({ className = '', ...props }, ref) {
  const classes = ['m-input', className].filter(Boolean).join(' ');
  return <input ref={ref} className={classes} {...props} />;
});

export default Input;
