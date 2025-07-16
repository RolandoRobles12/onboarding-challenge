import { Bot, Compass, GraduationCap, Rocket } from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import type { ForwardRefExoticComponent, RefAttributes } from 'react';

export type AvatarInfo = {
  name: string;
  Icon: ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>;
};

export const avatarData: { [key: string]: AvatarInfo } = {
  'bot': { name: 'Estratega de Compra', Icon: Bot },
  'rocket': { name: 'Impulsor de Negocios', Icon: Rocket },
  'graduation-cap': { name: 'Visionario Contigo', Icon: GraduationCap },
  'compass': { name: 'Explorador de Oportunidades', Icon: Compass },
};

export const defaultAvatar = 'bot';

export const getAvatarComponent = (key: string | null | undefined): ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>> => {
  return avatarData[key || defaultAvatar]?.Icon || avatarData[defaultAvatar].Icon;
};
