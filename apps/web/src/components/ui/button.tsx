import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:pointer-events-none",
	{
		defaultVariants: { variant: "default" },
		variants: {
			variant: {
				default: "primary",
				ghost: "signout",
				secondary: "secondary",
			},
		},
	}
);

interface ButtonProps
	extends React.ComponentProps<"button">,
		VariantProps<typeof buttonVariants> {
	asChild?: boolean;
}

function Button({
	asChild = false,
	className,
	variant,
	...props
}: ButtonProps) {
	const Component = asChild ? Slot : "button";

	return (
		<Component
			className={cn(buttonVariants({ variant }), className)}
			data-slot="button"
			{...props}
		/>
	);
}

export { Button, buttonVariants };
