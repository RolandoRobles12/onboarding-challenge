import { Bot, Compass, GraduationCap, Rocket } from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import type { ForwardRefExoticComponent, RefAttributes } from 'react';

export type AvatarInfo = {
  name: string;
  Icon: ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>;
};

export const avatarData: { [key: string]: AvatarInfo } = {
  'bot': { name: 'Capitán Proceso', Icon: Bot },
  'rocket': { name: 'Comandante Avance', Icon: Rocket },
  'graduation-cap': { name: 'Sabia Estratega', Icon: GraduationCap },
  'compass': { name: 'Guía Pionero', Icon: Compass },
};

export const defaultAvatar = 'bot';

export const getAvatarComponent = (key: string | null | undefined): ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>> => {
  return avatarData[key || defaultAvatar]?.Icon || avatarData[defaultAvatar].Icon;
};
