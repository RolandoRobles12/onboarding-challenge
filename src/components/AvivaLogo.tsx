import { cn } from '@/lib/utils';
import type { SVGProps } from 'react';

export function AvivaLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(props.className)}
      {...props}
    >
      <title>Aviva Logo</title>
      {/* Fondo verde */}
      <rect
        width="200"
        height="200"
        fill="#63B346"
        rx="0"
      />
      
      {/* Texto "aviva" con tipografía corregida */}
      <text
        x="100"
        y="130"
        textAnchor="middle"
        fontSize="52"
        fontWeight="500"
        fontFamily="Helvetica, Arial, sans-serif"
        fill="#1A3A1A"
        letterSpacing="-0.5px"
      >
        aviva
      </text>
    </svg>
  );
}
