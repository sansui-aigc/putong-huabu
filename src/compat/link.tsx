import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; children?: ReactNode; prefetch?: boolean };

export default function Link({ href, children, prefetch: _prefetch, ...props }: LinkProps) {
    return <RouterLink to={href} {...props}>{children}</RouterLink>;
}
