import React from 'react';
import { FlatCard } from '../components/ui';

export const MethodologyPage: React.FC = () => (
  <div className="space-y-6">
    <FlatCard title="Sekwencja analizy naukowej KOWR (Etapy 1 → 5)">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-sm">
        {[
          ['1. Ocena wilgotności', 'Bieżący i 10-letni bilans KBW (IUNG-PIB), ETc (FAO-56 Penman-Monteith) oraz Sentinel-2 NDVI/NDMI.'],
          ['2. Przyczyny deficytu', 'Udział klimatu, retencji gleby (AWC, próchnica), spadku (NMT), krajobrazu i wrażliwości uprawy.'],
          ['3. Retencja (PRIORYTET)', 'Zasada „Retain Water Where It Falls” (NWRM UE): zastawki w rowach, niecki NMT, pasy wiatrochronne, próchnica i międzyplony.'],
          ['4. Agrotechnika', 'Uprawa poprzecznostokowa (spadek ≥2%), ograniczenie głębokiej orki (strip-till), mulcz, dobór odmian.'],
          ['5. Nawadnianie (opcja)', 'Wyłącznie uzupełniająco: dawka FAO-56 (mm i m³/ha) z uwzględnieniem 7-dniowej prognozy opadów.'],
        ].map(([t, d]) => (
          <div key={t} className="border border-[#edf0f5] rounded-[3px] p-4 bg-[#fafcfd]">
            <div className="font-bold text-[#1abc9c] text-[15px] mb-1.5">{t}</div>
            <p className="text-[13.5px] text-[#55606e] leading-relaxed">{d}</p>
          </div>
        ))}
      </div>
    </FlatCard>

    <FlatCard title="Otwarte źródła danych i licencje" bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-[#f8fafc] border-b border-[#edf0f5] text-xs font-bold uppercase text-[#6c757d]">
              <th className="px-6 py-4">Kategoria</th>
              <th className="px-5 py-4">Źródło / API</th>
              <th className="px-5 py-4">Licencja</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf0f5]">
            {[
              ['Przestrzenne (EGiB)', 'GUGiK ULDK + KIEG WMS + UUG', 'Otwarte dane publiczne GUGiK'],
              ['Ukształtowanie terenu', 'GUGiK NMT 1 m (zapasowo Open-Meteo DEM)', 'Otwarte dane publiczne GUGiK / CC-BY 4.0'],
              ['Meteorologiczne (10 lat)', 'NASA POWER Agroclimatology + Open-Meteo + IMGW Synop', 'Public Domain / CC-BY 4.0 / Dane Publiczne IMGW'],
              ['Satelitarne', 'Copernicus Sentinel-2 L2A (AWS Earth Search STAC COG)', 'Copernicus Free, Full & Open Data Policy'],
              ['Glebowe', 'ISRIC SoilGrids v2.0 + Saxton & Rawls (2006) + IUNG I–IV', 'CC-BY 4.0 (ISRIC)'],
              ['Hydrologiczne', 'IMGW-PIB Hydro + OpenStreetMap Overpass', 'Dane Publiczne IMGW / ODbL (OSM)'],
            ].map(([cat, src, lic]) => (
              <tr key={src}>
                <td className="px-6 py-3.5 font-bold text-[#37474f]">{cat}</td>
                <td className="px-5 py-3.5 text-[#55606e]">{src}</td>
                <td className="px-5 py-3.5 text-[#7f8c8d]">{lic}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FlatCard>
  </div>
);
