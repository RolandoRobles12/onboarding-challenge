import { cn } from '@/lib/utils';
import type { SVGProps } from 'react';

export function AvivaLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      className={cn(props.className)}
      {...props}
    >
      <title>Aviva Logo</title>
      <path fill="#00C37E" d="M0,0h200v200h-200z" />
      <g transform="translate(30 120) scale(1.2 1.2)">
        <path
            fill="#1A3A34"
            d="M0,0c0,-10 8,-18 18,-18c6,0 12,3 15,9l0,30h-9v-5c-3,4 -7,6 -12,6c-7,0 -12,-5 -12,-12zM27,0c0,-6 -5,-9 -9,-9s-9,3 -9,9c0,6 5,9 9,9s9,-3 9,-9z"
        />
        <path
            fill="#1A3A34"
            transform="translate(40)"
            d="M0,0l6,18l6,-18h9l-10,30h-10l-10,-30z"
        />
        <circle
            fill="#1A3A34"
            cx="75"
            cy="-10"
            r="3"
        />
        <path
            fill="#1A3A34"
            transform="translate(70)"
            d="M0,0h9v30h-9z"
        />
        <path
            fill="#1A3A34"
            transform="translate(85)"
            d="M0,0l6,18l6,-18h9l-10,30h-10l-10,-30z"
        />
        <path
            fill="#1A3A34"
            transform="translate(125)"
            d="M0,0c0,-10 8,-18 18,-18c6,0 12,3 15,9l0,30h-9v-5c-3,4 -7,6 -12,6c-7,0 -12,-5 -12,-12zM27,0c0,-6 -5,-9 -9,-9s-9,3 -9,9c0,6 5,9 9,9s9,-3 9,-9z"
        />
      </g>
    </svg>
  );
}
