import { cn } from '@/lib/utils';
import type { SVGProps } from 'react';

export function AvivaLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 140 40"
      className={cn('text-primary', props.className)}
      {...props}
    >
      <title>Aviva Logo</title>
      <text
        x="50%"
        y="50%"
        dominantBaseline="middle"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontSize="32"
        fontWeight="600"
        fill="currentColor"
        letterSpacing="1"
      >
        aviva
      </text>
    </svg>
  );
}
