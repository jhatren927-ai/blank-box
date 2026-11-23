import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn.ts'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-white/10 font-sans font-semibold tracking-[0.01em] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_5px_rgba(0,0,0,0.2)] transition-[transform,background-color,color,box-shadow,border-color] duration-150 hover:-translate-y-px hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_5px_12px_rgba(0,0,0,0.28)] active:translate-y-0 disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-300',
  {
    variants: {
      variant: {
        default: 'border-[#f3d47c] bg-gradient-to-b from-[#f8df91] to-[#c89b39] text-[#111827] hover:from-[#ffe8a9] hover:to-[#d9aa44]',
        chassis:
          'border-[#556782] bg-gradient-to-b from-[#34455e] to-[#1b293e] text-slate-100 hover:from-[#415572] hover:to-[#243650]',
        ghost: 'border-transparent bg-transparent text-slate-300 shadow-none hover:bg-white/8 hover:text-yellow-200',
        danger: 'border-red-400/40 bg-gradient-to-b from-[#a83c42] to-[#76262d] text-white hover:from-[#c34a50] hover:to-[#8d2d36]',
        navy: 'border-[#3c5c91] bg-gradient-to-b from-[#17366a] to-[#0b1d42] text-[#ffe49a] hover:from-[#214780] hover:to-[#102853]',
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
