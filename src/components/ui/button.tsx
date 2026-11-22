import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn.ts'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-mono font-bold transition-[transform,background-color,color] duration-100 active:translate-y-0.5 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-300',
  {
    variants: {
      variant: {
        default: 'bg-yellow-400 text-black hover:bg-yellow-300',
        chassis:
          'bevel bg-[#1b2333] text-slate-100 hover:bg-[#263149]',
        ghost: 'bg-transparent text-slate-300 hover:bg-white/5 hover:text-yellow-300',
        danger: 'bg-red-700 text-white hover:bg-red-600',
        navy: 'bevel bg-[#001144] text-yellow-300 hover:bg-[#001a66]',
      },
      size: {
        default: 'h-12 px-4 text-sm',
        sm: 'h-10 px-3 text-xs',
        lg: 'h-16 px-6 text-lg',
        icon: 'h-12 w-12',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
}
