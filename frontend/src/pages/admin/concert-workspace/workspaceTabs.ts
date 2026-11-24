import { CalendarDays, ClipboardCheck, Settings2, Sparkles, Ticket, Users } from 'lucide-react';
import { translate } from '../../../i18n';

export type WorkspaceTab = 'overview' | 'details' | 'tickets' | 'guests' | 'operations' | 'artist';

export const tabs: Array<{ id: WorkspaceTab; label: string; icon: typeof CalendarDays }> = [
  {
    id: 'overview',
    get label() {
      return translate('admin:concertWorkspacePage_tongQuan');
    },
    icon: CalendarDays,
  },
  {
    id: 'details',
    get label() {
      return translate('admin:concertWorkspacePage_thongTinLich');
    },
    icon: Settings2,
  },
  {
    id: 'tickets',
    get label() {
      return translate('admin:concertWorkspacePage_hangVe');
    },
    icon: Ticket,
  },
  {
    id: 'guests',
    get label() {
      return translate('admin:concertWorkspacePage_khachMoi');
    },
    icon: Users,
  },
  {
    id: 'operations',
    get label() {
      return translate('admin:concertWorkspacePage_donHangCheckIn');
    },
    icon: ClipboardCheck,
  },
  {
    id: 'artist',
    get label() {
      return translate('admin:concertWorkspacePage_ngheSiAi');
    },
    icon: Sparkles,
  },
];

export function parseWorkspaceTab(value: string | null): WorkspaceTab {
  return tabs.some((item) => item.id === value) ? (value as WorkspaceTab) : 'overview';
}
