import { cn } from '@/lib/utils';
import type { SVGProps } from 'react';

export function AvivaLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 50"
      className={cn('text-primary', props.className)}
      {...props}
    >
      <title>AvivaQuest Logo</title>
      <path
        d="M25.6,48.4,1.4,1.1h9.6l19.4,38,19.2-38h9.6L35.1,48.4Z"
        fill="currentColor"
        transform="translate(-1.4 -0.3)"
      />
      <path
        d="M62.6,35.3V1.1h8.9V35.3c0,4.8,2.7,7.8,7.4,7.8s7.4-3,7.4-7.8V1.1h8.9V35.3c0,9.9-6.3,15.2-16.3,15.2S62.6,45.2,62.6,35.3Z"
        fill="currentColor"
        transform="translate(-1.4 -0.3)"
      />
      <path
        d="M102,1.1h8.9V48.4H102Z"
        fill="currentColor"
        transform="translate(-1.4 -0.3)"
      />
      <path
        d="M136.2,48.4,112,1.1h9.6l19.4,38,19.2-38h9.6l-24.1,47.3Z"
        fill="currentColor"
        transform="translate(-1.4 -0.3)"
      />
      <path
        d="M172,1.1h9.6l19.4,38,19.2-38H220L195.8,48.4H186Z"
        fill="currentColor"
        transform="translate(-1.4 -0.3)"
      />
    </svg>
  );
}
