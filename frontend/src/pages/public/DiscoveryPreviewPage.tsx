import type { DiscoveryConcert } from '../../features/discovery/filters';
import { HomePage } from './HomePage';

const fromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

const concerts: DiscoveryConcert[] = [
  {
    id: 'fixture-jazz-hanoi', title: 'Rooftop Jazz at Dusk', venueName: 'Nhà hát Hồ Gươm',
    translations: { vi: { title: 'Jazz trên sân thượng lúc hoàng hôn', description: null } },
    city: 'hanoi', category: 'jazz', price: 350_000, eventDate: fromNow(4),
    status: 'ON_SALE', saleStartAt: fromNow(-2), saleEndAt: fromNow(3), posterUrl: null,
  },
  {
    id: 'fixture-chamber-hanoi', title: 'The City Chamber Series', venueName: 'Nhà hát Lớn Hà Nội',
    translations: { vi: { title: 'Đêm nhạc thính phòng Hà Nội', description: null } },
    city: 'hanoi', category: 'classical', price: 680_000, eventDate: fromNow(6),
    status: 'ON_SALE', saleStartAt: fromNow(1), saleEndAt: fromNow(5), posterUrl: null,
  },
  {
    id: 'fixture-pop-hcmc', title: 'City Lights Pop Night', venueName: 'Nhà hát Hòa Bình',
    translations: { vi: { title: 'Đêm nhạc pop Ánh Đèn Thành Phố', description: null } },
    city: 'hcmc', category: 'pop', price: 780_000, eventDate: fromNow(9),
    status: 'SOLD_OUT', saleStartAt: fromNow(-5), saleEndAt: fromNow(8), posterUrl: null,
  },
  {
    id: 'fixture-jazz-hcmc', title: 'Saturday Jazz Sessions', venueName: 'Nhà hát Thành phố',
    translations: { vi: { title: 'Đêm jazz cuối tuần', description: null } },
    city: 'hcmc', category: 'jazz', price: 280_000, eventDate: fromNow(12),
    status: 'ON_SALE', saleStartAt: fromNow(-1), saleEndAt: fromNow(11), posterUrl: null,
  },
];

export default function DiscoveryPreviewPage() {
  return <HomePage previewConcerts={concerts} />;
}
