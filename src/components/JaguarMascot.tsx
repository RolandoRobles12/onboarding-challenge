import { cn } from '@/lib/utils';
import type { SVGProps } from 'react';

/**
 * Aviva Jaguar mascot — inline SVG, no external assets needed.
 * Stylized jaguar with Aviva green tones, suitable for certificates.
 */
export function JaguarMascot({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 200 260"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
      aria-label="Mascota Jaguar Aviva"
      {...props}
    >
      {/* ── Tail ── */}
      <path
        d="M148 210 Q175 225 168 250 Q162 265 152 252 Q158 240 145 230 Z"
        fill="rgba(255,255,255,0.25)"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1"
      />

      {/* ── Body ── */}
      <ellipse cx="100" cy="185" rx="52" ry="58" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />

      {/* ── Body belly (lighter) ── */}
      <ellipse cx="100" cy="192" rx="32" ry="40" fill="rgba(255,255,255,0.25)" />

      {/* ── Body spots ── */}
      <ellipse cx="78" cy="170" rx="8" ry="6" fill="rgba(255,255,255,0.2)" />
      <ellipse cx="122" cy="172" rx="7" ry="5" fill="rgba(255,255,255,0.2)" />
      <ellipse cx="85" cy="195" rx="6" ry="5" fill="rgba(255,255,255,0.15)" />
      <ellipse cx="115" cy="196" rx="6" ry="5" fill="rgba(255,255,255,0.15)" />
      <ellipse cx="100" cy="175" rx="5" ry="4" fill="rgba(255,255,255,0.18)" />

      {/* ── Front legs ── */}
      <rect x="74" y="228" width="20" height="30" rx="10" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
      <rect x="106" y="228" width="20" height="30" rx="10" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />

      {/* ── Paws ── */}
      <ellipse cx="84" cy="258" rx="12" ry="6" fill="rgba(255,255,255,0.3)" />
      <ellipse cx="116" cy="258" rx="12" ry="6" fill="rgba(255,255,255,0.3)" />

      {/* ── Neck ── */}
      <ellipse cx="100" cy="138" rx="28" ry="18" fill="rgba(255,255,255,0.2)" />

      {/* ── Head ── */}
      <ellipse cx="100" cy="105" rx="44" ry="40" fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />

      {/* ── Ears ── */}
      <polygon points="62,72 50,45 78,65" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
      <polygon points="138,72 150,45 122,65" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
      {/* Ear inner */}
      <polygon points="64,70 55,52 75,65" fill="rgba(255,255,255,0.15)" />
      <polygon points="136,70 145,52 125,65" fill="rgba(255,255,255,0.15)" />

      {/* ── Face spots / markings ── */}
      <ellipse cx="75" cy="95" rx="8" ry="6" fill="rgba(255,255,255,0.15)" />
      <ellipse cx="125" cy="95" rx="8" ry="6" fill="rgba(255,255,255,0.15)" />
      <ellipse cx="100" cy="88" rx="6" ry="5" fill="rgba(255,255,255,0.12)" />

      {/* ── Eyes ── */}
      {/* Eye whites */}
      <ellipse cx="82" cy="100" rx="10" ry="9" fill="white" opacity="0.9" />
      <ellipse cx="118" cy="100" rx="10" ry="9" fill="white" opacity="0.9" />
      {/* Pupils */}
      <ellipse cx="83" cy="101" rx="6" ry="7" fill="#0a3a1e" />
      <ellipse cx="119" cy="101" rx="6" ry="7" fill="#0a3a1e" />
      {/* Eye shine */}
      <circle cx="85" cy="98" r="2" fill="white" opacity="0.8" />
      <circle cx="121" cy="98" r="2" fill="white" opacity="0.8" />

      {/* ── Nose ── */}
      <path d="M95 118 Q100 122 105 118 Q100 126 95 118 Z" fill="rgba(255,255,255,0.6)" />
      {/* Nostrils */}
      <ellipse cx="97" cy="116" rx="3" ry="2.5" fill="rgba(0,0,0,0.3)" />
      <ellipse cx="103" cy="116" rx="3" ry="2.5" fill="rgba(0,0,0,0.3)" />

      {/* ── Muzzle ── */}
      <ellipse cx="100" cy="120" rx="18" ry="12" fill="rgba(255,255,255,0.18)" />

      {/* ── Mouth ── */}
      <path d="M92 122 Q100 130 108 122" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" fill="none" />

      {/* ── Whiskers ── */}
      <line x1="60" y1="118" x2="82" y2="120" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeLinecap="round" />
      <line x1="58" y1="123" x2="82" y2="124" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeLinecap="round" />
      <line x1="60" y1="128" x2="82" y2="126" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeLinecap="round" />
      <line x1="118" y1="120" x2="140" y2="118" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeLinecap="round" />
      <line x1="118" y1="124" x2="142" y2="123" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeLinecap="round" />
      <line x1="118" y1="126" x2="140" y2="128" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeLinecap="round" />

      {/* ── Tie / bowtie (dapper mascot) ── */}
      <path d="M88 148 L100 155 L112 148 L100 142 Z" fill="rgba(255,255,255,0.4)" />
      <circle cx="100" cy="150" r="4" fill="rgba(255,255,255,0.5)" />
    </svg>
  );
}
