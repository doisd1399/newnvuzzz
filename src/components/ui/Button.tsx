import React from 'react';
import { cn } from '../../lib/utils';

type ButtonProps = React.ComponentProps<"button"> & {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
};

export function Button({ className, variant = 'primary', size = 'md', ...props }: ButtonProps) {
  const baseStyles = "inline-flex items-center justify-center rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-white";
  
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-50 dark:bg-blue-500/100",
    secondary: "bg-gray-100 dark:bg-[#27272a] text-gray-900 dark:text-[#fafafa] hover:bg-gray-200 dark:hover:bg-[#3f3f46]",
    outline: "border border-gray-200 dark:border-[#2A2F3A] bg-transparent hover:bg-gray-50 dark:hover:bg-[#3f3f46] text-gray-900 dark:text-[#fafafa]",
    ghost: "bg-transparent hover:bg-gray-100 dark:hover:bg-[#3f3f46] text-gray-900 dark:text-[#fafafa]",
    danger: "bg-red-50 dark:bg-red-500/10 border border-transparent dark:border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-rose-500/20",
  };
  
  const sizes = {
    sm: "h-9 px-3 text-sm",
    md: "h-11 px-5 py-2",
    lg: "h-14 px-8 text-lg rounded-2xl",
  };

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}
