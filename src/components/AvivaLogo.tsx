import { cn } from '@/lib/utils';
import type { SVGProps } from 'react';

export function AvivaLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 140 40"
      className={cn(props.className)}
      {...props}
    >
      <title>Aviva Logo</title>
      <style>{`
        .aviva-text {
          font-family: 'Inter', sans-serif;
          font-size: 32px;
          font-weight: 700;
        }
        .aviva-blue {
          fill: hsl(var(--primary));
        }
        .aviva-green {
          fill: hsl(var(--accent));
        }
      `}</style>
      <text
        x="50%"
        y="50%"
        dominantBaseline="middle"
        textAnchor="middle"
        className="aviva-text"
      >
        <tspan className="aviva-blue">avi</tspan><tspan className="aviva-green">v</tspan><tspan className="aviva-blue">a</tspan>
      </text>
    </svg>
  );
}
