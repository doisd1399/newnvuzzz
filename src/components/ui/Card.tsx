import React from 'react';
import { cn } from '../../lib/utils';

type CardProps = React.ComponentProps<"div">;

export function Card({ className, ...props }: CardProps) {
  return (
    <div className={cn("bg-white dark:bg-[#1A1F26] rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-gray-100 dark:border-[#2A2F3A]", className)} {...props} />
  );
}

export function CardHeader({ className, ...props }: CardProps) {
  return <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />;
}

export function CardTitle({ className, children, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("text-lg font-semibold text-gray-900 dark:text-[#fafafa] leading-none tracking-tight", className)} {...props}>{children}</h3>;
}

export function CardContent({ className, ...props }: CardProps) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}
