import { User, Shield, UserCog, UserRound } from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import type { ForwardRefExoticComponent, RefAttributes } from 'react';

export const avatarComponents: { [key: string]: ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>> } = {
  'user-round': UserRound,
  'shield': Shield,
  'user-cog': UserCog,
  'user': User,
};

export const defaultAvatar = 'user-round';

export const getAvatarComponent = (key: string | null | undefined) => {
  return avatarComponents[key || defaultAvatar] || avatarComponents[defaultAvatar];
};
