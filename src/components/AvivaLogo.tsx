import { cn } from '@/lib/utils';
import type { SVGProps } from 'react';

export function AvivaLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 160 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(props.className)}
      {...props}
    >
      <title>Aviva Logo</title>
      <text
        x="80"
        y="28"
        textAnchor="middle"
        fontSize="32"
        fontWeight="500"
        fontFamily="Helvetica, Arial, sans-serif"
        fill="#23cd7d"
        letterSpacing="-0.5px"
      >
        aviva
      </text>
    </svg>
  );
}
