import { cn } from '@/lib/utils';
import type { UserBadge } from '@/lib/types-scalable';

interface BadgeDisplayProps {
  /** Para mostrar un badge ya ganado */
  userBadge?: UserBadge;
  /** Para mostrar solo la definición (preview en admin) */
  name?: string;
  emoji?: string;
  color?: string;
  description?: string;
  /** Estado visual */
  locked?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Muestra nombre y descripción debajo */
  showLabel?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { circle: 'h-12 w-12', emoji: 'text-xl', name: 'text-xs', desc: 'text-[10px]' },
  md: { circle: 'h-16 w-16', emoji: 'text-3xl', name: 'text-sm',  desc: 'text-xs' },
  lg: { circle: 'h-24 w-24', emoji: 'text-5xl', name: 'text-base', desc: 'text-sm' },
};

export function BadgeDisplay({
  userBadge,
  name,
  emoji,
  color,
  description,
  locked = false,
  size = 'md',
  showLabel = true,
  className,
}: BadgeDisplayProps) {
  const displayName  = userBadge?.badgeName        ?? name        ?? 'Insignia';
  const displayEmoji = userBadge?.badgeEmoji        ?? emoji       ?? '🏅';
  const displayColor = userBadge?.badgeColor        ?? color       ?? '#0a6b3e';
  const displayDesc  = userBadge?.badgeDescription  ?? description ?? '';

  const s = sizeMap[size];

  return (
    <div className={cn('flex flex-col items-center gap-1.5 group', className)}>
      {/* Badge circle */}
      <div
        className={cn(
          'relative flex items-center justify-center rounded-full shadow-md transition-transform group-hover:scale-105',
          s.circle,
          locked && 'grayscale opacity-40'
        )}
        style={{ background: locked ? '#d1d5db' : `radial-gradient(circle at 35% 35%, ${displayColor}cc, ${displayColor})` }}
        title={displayName}
      >
        {/* Shine effect */}
        {!locked && (
          <div className="absolute inset-0 rounded-full bg-white/10 pointer-events-none" />
        )}

        {/* Inner ring */}
        <div
          className="absolute inset-1 rounded-full border border-white/30 pointer-events-none"
        />

        {/* Emoji */}
        <span className={cn(s.emoji, 'select-none leading-none z-10')}>
          {locked ? '🔒' : displayEmoji}
        </span>
      </div>

      {/* Label */}
      {showLabel && (
        <div className="text-center max-w-[96px]">
          <p className={cn(s.name, 'font-semibold leading-tight', locked && 'text-muted-foreground')}>
            {displayName}
          </p>
          {displayDesc && (
            <p className={cn(s.desc, 'text-muted-foreground leading-tight mt-0.5 line-clamp-2')}>
              {displayDesc}
            </p>
          )}
          {userBadge?.earnedAt && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
              {(userBadge.earnedAt as unknown as { toDate?: () => Date }).toDate?.()?.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' }) ?? ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
