import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const native = Capacitor.isNativePlatform();
const ignore = () => {};

export const haptics = {
  fall(): void {
    if (native) Haptics.notification({ type: NotificationType.Error }).catch(ignore);
  },
  win(): void {
    if (native) Haptics.notification({ type: NotificationType.Success }).catch(ignore);
  },
  checkpoint(): void {
    if (native) Haptics.impact({ style: ImpactStyle.Medium }).catch(ignore);
  },
  tap(): void {
    if (native) Haptics.impact({ style: ImpactStyle.Light }).catch(ignore);
  },
};
