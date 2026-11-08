import * as React from 'react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import { XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const Sheet = SheetPrimitive.Root;

function SheetContent({ className, children, ...props }: React.ComponentProps<typeof SheetPrimitive.Content>) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="anim-fade fixed inset-0 z-50 bg-black/40" />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn('anim-sheet fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col border-l bg-background shadow-xl sm:max-w-xl', className)}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="absolute top-4 right-4 rounded-sm p-1 opacity-70 transition-opacity hover:bg-accent hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

const SheetTitle = SheetPrimitive.Title;
const SheetDescription = SheetPrimitive.Description;

export { Sheet, SheetContent, SheetTitle, SheetDescription };
