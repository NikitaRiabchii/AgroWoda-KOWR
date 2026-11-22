import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Droplets, Loader2, MapPin, Search } from 'lucide-react';
import api from '../services/api';
import {
  apiError,
  type CropDefinition,
  type CropId,
  type ExampleParcel,
  type LocationSearchResult,
  type ParcelGeometry,
  type WaterAnalysisReport,
} from '../types/water';
import { FlatCard, Toast, btnOutline, btnTeal, inputCls, labelCls, useToast } from '../components/ui';
import { ParcelMap } from '../components/ParcelMap';
import { ReportView } from '../components/ReportView';

const todayIso = () => new Date().toISOString().slice(0, 10);
const tenYearsAgoIso = () => `${new Date().getFullYear() - 10}-01-01`;
const TERYT_RE = /^\d{6}_\d\.\d{4}\./;

interface ParsedCoords {
  lat: number;
  lng: number;
  inPoland: boolean;
}

const parseCoordinatesInput = (raw: string): ParsedCoords | null => {
  const s = raw.trim();
  if (!s) return null;

  const finalize = (a: number, b: number, aDir?: string, bDir?: string): ParsedCoords | null => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    let lat = a;
    let lng = b;
    const d1 = aDir?.toUpperCase();
    const d2 = bDir?.toUpperCase();

    if (d1 === 'E' || d1 === 'W' || d2 === 'N' || d2 === 'S') {
      lat = b * (d2 === 'S' ? -1 : 1);
      lng = a * (d1 === 'W' ? -1 : 1);
    } else {
      if (d1 === 'S') lat = -Math.abs(lat);
      if (d2 === 'W') lng = -Math.abs(lng);
      if (!d1 && !d2 && a >= 13.8 && a <= 24.5 && b >= 48.5 && b <= 55.2) {
        lat = b;
        lng = a;
      }
    }
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    const inPoland = lat >= 48.5 && lat <= 55.2 && lng >= 13.8 && lng <= 24.5;
    return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, inPoland };
  };

  const dms = s.match(
    /^([NS])?\s*(\d{1,2})\s*[°º]\s*(\d{1,2})\s*[′']\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*[″"]?)?\s*([NS])?[\s,;/]+([EW])?\s*(\d{1,3})\s*[°º]\s*(\d{1,2})\s*[′']\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*[″"]?)?\s*([EW])?$/i
  );
  if (dms) {
    const deg1 = Number(dms[2]) + Number(dms[3]) / 60 + (dms[4] ? Number(dms[4].replace(',', '.')) / 3600 : 0);
    const deg2 = Number(dms[7]) + Number(dms[8]) / 60 + (dms[9] ? Number(dms[9].replace(',', '.')) / 3600 : 0);
    return finalize(deg1, deg2, dms[1] || dms[5], dms[6] || dms[10]);
  }

  const cm = s.match(
    /^([NS])?\s*([+-]?\d{1,2},\d+)\s*[°º]?\s*([NS])?\s*(?:[;/\s]+|,\s+)\s*([EW])?\s*([+-]?\d{1,3},\d+)\s*[°º]?\s*([EW])?$/i
  );
  if (cm) {
    return finalize(Number(cm[2].replace(',', '.')), Number(cm[5].replace(',', '.')), cm[1] || cm[3], cm[4] || cm[6]);
  }

  const dm = s.match(
    /^([NS])?\s*([+-]?\d{1,2}(?:\.\d+)?)\s*[°º]?\s*([NS])?\s*[,;/\s]+\s*([EW])?\s*([+-]?\d{1,3}(?:\.\d+)?)\s*[°º]?\s*([EW])?$/i
  );
  if (dm) {
    return finalize(Number(dm[2]), Number(dm[5]), dm[1] || dm[3], dm[4] || dm[6]);
  }

  return null;
};

export const AnalyzerPage: React.FC = () => {
  const { toast, show } = useToast();
  const [crops, setCrops] = useState<CropDefinition[]>([]);
  const [examples, setExamples] = useState<ExampleParcel[]>([]);

  const [parcelInput, setParcelInput] = useState('');
  const [inputDirty, setInputDirty] = useState(false);
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [selectedParcel, setSelectedParcel] = useState<ParcelGeometry | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom?: number; ts: number } | null>(null);
  const [resolvingParcel, setResolvingParcel] = useState(false);

  const [cropId, setCropId] = useState<CropId>('zboza_ozime');
  const [analysisDate, setAnalysisDate] = useState<string>(todayIso());
  const [showMapPicker, setShowMapPicker] = useState(true);

  const [analyzing, setAnalyzing] = useState(false);
  const [report, setReport] = useState<WaterAnalysisReport | null>(null);

  useEffect(() => {
    Promise.all([api.get('/crops'), api.get('/parcels/examples')])
      .then(([cRes, eRes]) => {
        setCrops(cRes.data.crops ?? []);
        setExamples(eRes.data.examples ?? []);
      })
      .catch(() => show('error', 'Brak połączenia z serwerem API (port 5000).'));
  }, [show]);

  const selectParcelById = async (teryt: string) => {
    setResolvingParcel(true);
    setSearchResults([]);
    try {
      const res = await api.get('/parcels/lookup', { params: { id: teryt } });
      const parcel: ParcelGeometry = res.data.parcel;
      setSelectedParcel(parcel);
      setSelectedPoint(parcel.centroid);
      setParcelInput(parcel.teryt ?? teryt);
      setInputDirty(false);
      setFlyTo({ lat: parcel.centroid.lat, lng: parcel.centroid.lng, zoom: 16, ts: Date.now() });
    } catch (err) {
      show('error', apiError(err, 'Nie znaleziono działki w usłudze ULDK.'));
    } finally {
      setResolvingParcel(false);
    }
  };

  const selectPointAndResolve = async (lat: number, lng: number, zoom?: number, displayLabel?: string) => {
    setSelectedPoint({ lat, lng });
    setSearchResults([]);
    setShowMapPicker(true);
    if (zoom) {
      setFlyTo({ lat, lng, zoom, ts: Date.now() });
    }
    setResolvingParcel(true);
    try {
      const res = await api.get('/parcels/lookup', { params: { lat, lng } });
      const parcel: ParcelGeometry = res.data.parcel;
      setSelectedParcel(parcel);
      if (parcel.teryt) {
        setParcelInput(parcel.teryt);
      } else if (displayLabel) {
        setParcelInput(displayLabel);
      }
      setInputDirty(false);
      if (displayLabel) {
        show('success', `Wybrano lokalizację: ${displayLabel}. Możesz kliknąć „Analizuj” lub wskazać inną działkę na mapie.`);
      }
    } catch (err) {
      show('error', apiError(err, 'Wskazany punkt leży poza Polską lub nie rozpoznano działki.'));
    } finally {
      setResolvingParcel(false);
    }
  };

  const selectSearchResult = async (res: LocationSearchResult) => {
    if (res.teryt) {
      await selectParcelById(res.teryt);
      return;
    }
    const label = res.sublabel ? `${res.label} (${res.sublabel})` : res.label;
    await selectPointAndResolve(res.lat, res.lng, 14, label);
  };

  const handleLookupOrSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = parcelInput.trim();
    if (!q) return;

      if (TERYT_RE.test(q)) {
        await selectParcelById(q);
        return;
      }

      const coords = parseCoordinatesInput(q);
      if (coords) {
        if (!coords.inPoland) {
          show('error', 'Podane współrzędne leżą poza obszarem Polski (48.5–55.2°N, 13.8–24.5°E).');
          return;
        }
        await selectPointAndResolve(
          coords.lat,
          coords.lng,
          16,
          `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
        );
        return;
      }

      setSearching(true);
      setSearchResults([]);
      try {
        const res = await api.get('/parcels/search', { params: { q } });
        const list: LocationSearchResult[] = res.data.results ?? [];
        if (!list.length) {
          show('error', 'Nie znaleziono miejscowości ani działki. Wpisz TERYT, współrzędne (np. 52.85, 18.25) lub kliknij na mapie.');
        } else if (list.length === 1) {
          await selectSearchResult(list[0]);
        } else {
          setSearchResults(list);
          setShowMapPicker(true);
        }
      } catch (err) {
        show('error', apiError(err, 'Błąd wyszukiwania lokalizacji.'));
      } finally {
        setSearching(false);
      }
    };

    const handleMapClick = async (lat: number, lng: number) => {
      await selectPointAndResolve(lat, lng);
    };

    const applyExample = async (ex: ExampleParcel) => {
      setCropId(ex.suggestedCropId);
      setAnalysisDate(ex.suggestedHistoricalDate);
      setSearchResults([]);
      if (ex.teryt) {
        setParcelInput(ex.teryt);
        await selectParcelById(ex.teryt);
      } else {
        setParcelInput('');
        setFlyTo({ lat: ex.lat, lng: ex.lng, zoom: 15, ts: Date.now() });
        await handleMapClick(ex.lat, ex.lng);
      }
    };

    const handleAnalyze = async () => {
      const trimmed = parcelInput.trim();
      let terytToSend: string | undefined;
      let latToSend: number | undefined;
      let lngToSend: number | undefined;

      // Jeśli użytkownik wpisał nową wartość w polu wyszukiwania i od razu kliknął „Analizuj”, rozpoznaj ją automatycznie
      if (trimmed && (inputDirty || (!selectedParcel && !selectedPoint))) {
        if (TERYT_RE.test(trimmed)) {
          terytToSend = trimmed;
        } else {
          const coords = parseCoordinatesInput(trimmed);
          if (coords) {
            if (!coords.inPoland) {
              show('error', 'Podane współrzędne leżą poza obszarem Polski (48.5–55.2°N, 13.8–24.5°E).');
              return;
            }
            latToSend = coords.lat;
            lngToSend = coords.lng;
            setSelectedPoint({ lat: coords.lat, lng: coords.lng });
            setFlyTo({ lat: coords.lat, lng: coords.lng, zoom: 16, ts: Date.now() });
          } else {
            setAnalyzing(true);
            try {
              const searchRes = await api.get('/parcels/search', { params: { q: trimmed } });
              const list: LocationSearchResult[] = searchRes.data.results ?? [];
              if (!list.length) {
                show('error', `Nie znaleziono miejscowości „${trimmed}”. Sprawdź nazwę, podaj współrzędne lub kliknij na mapie.`);
                setAnalyzing(false);
                return;
              }
              const top = list[0];
              terytToSend = top.teryt;
              latToSend = top.lat;
              lngToSend = top.lng;
              setSearchResults([]);
              setSelectedPoint({ lat: top.lat, lng: top.lng });
              setFlyTo({ lat: top.lat, lng: top.lng, zoom: 14, ts: Date.now() });
            } catch (err) {
              show('error', apiError(err, 'Nie udało się wyszukać podanej lokalizacji.'));
              setAnalyzing(false);
              return;
            }
          }
        }
      } else {
        terytToSend = selectedParcel?.teryt || (TERYT_RE.test(trimmed) ? trimmed : undefined);
        latToSend = selectedParcel?.centroid.lat ?? selectedPoint?.lat;
        lngToSend = selectedParcel?.centroid.lng ?? selectedPoint?.lng;
      }

      if (!terytToSend && (latToSend === undefined || lngToSend === undefined)) {
        show('error', 'Wpisz miejscowość, współrzędne (np. 52.85, 18.25), numer TERYT lub kliknij pole na mapie.');
        return;
      }

      setAnalyzing(true);
      try {
        const res = await api.post('/analyze', {
          parcelId: terytToSend,
          lat: latToSend,
          lng: lngToSend,
          cropId,
          analysisDate,
          save: true,
        });
        const r: WaterAnalysisReport = res.data.report;
        setReport(r);
        setSelectedParcel(r.parcel);
        setSelectedPoint(r.parcel.centroid);
        if (r.parcel.teryt) setParcelInput(r.parcel.teryt);
        setInputDirty(false);
        setShowMapPicker(false);
        show('success', `Analiza gotowa (${(r.executionTimeMs / 1000).toFixed(1)} s) i zapisana w raportach.`);
      } catch (err) {
        show('error', apiError(err, 'Nie udało się przeprowadzić analizy.'));
      } finally {
        setAnalyzing(false);
      }
    };

    return (
      <div className="space-y-6">
        <Toast toast={toast} />

        <FlatCard className="no-print" bodyClassName="p-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <form onSubmit={handleLookupOrSearch} className="md:col-span-5">
              <label className={labelCls}>Działka (TERYT), miejscowość lub współrzędne</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={parcelInput}
                  onChange={(e) => {
                    setParcelInput(e.target.value);
                    setInputDirty(true);
                  }}
                  placeholder="np. 040704_2.0007.68, Inowrocław lub 52.85, 18.25"
                  className={inputCls}
                />
                <button type="submit" disabled={searching || !parcelInput.trim()} className={btnOutline} title="Wyszukaj">
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </button>
              </div>
            </form>

            <div className="md:col-span-3">
              <label className={labelCls} htmlFor="crop-select">Uprawa</label>
              <select
                id="crop-select"
                value={cropId}
                onChange={(e) => setCropId(e.target.value as CropId)}
                className={inputCls}
              >
                {crops.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.namePl}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className={labelCls} htmlFor="date-input">Data analizy (10 lat)</label>
              <input
                id="date-input"
                type="date"
                min={tenYearsAgoIso()}
                max={todayIso()}
                value={analysisDate}
                onChange={(e) => setAnalysisDate(e.target.value)}
                className={inputCls}
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={analyzing || resolvingParcel}
                className={`${btnTeal} w-full py-3 text-[15px]`}
              >
                {analyzing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Droplets className="h-5 w-5" />}
                {analyzing ? 'Analizuję...' : 'Analizuj'}
              </button>
            </div>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-3 border border-[#d5dce3] rounded-[3px] bg-[#f8fafc] divide-y divide-[#edf0f5]">
              {searchResults.map((res, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectSearchResult(res)}
                  className="w-full text-left px-4 py-2.5 hover:bg-white text-sm flex justify-between gap-4"
                >
                  <span className="font-semibold text-[#37474f]">{res.label}</span>
                  <span className="text-[#7f8c8d] text-right">{res.sublabel}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-[#edf0f5] flex flex-wrap items-center justify-between gap-3 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[#7f8c8d] font-semibold">Przykłady:</span>
              {examples.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => applyExample(ex)}
                  className="px-3 py-1.5 rounded-[3px] border border-[#d5dce3] bg-[#f8fafc] hover:border-[#1abc9c] hover:text-[#16a085] text-[#55606e] font-semibold transition"
                >
                  {ex.labelPl}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowMapPicker((v) => !v)}
              className="inline-flex items-center gap-1.5 text-[#1abc9c] hover:text-[#16a085] font-semibold text-sm"
            >
              <MapPin className="h-4 w-4" />
              {showMapPicker ? 'Ukryj mapę wyboru' : 'Wskaż działkę na mapie'}
              {showMapPicker ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>

          {showMapPicker && (
            <div className="mt-4">
              <ParcelMap
                parcel={selectedParcel}
                selectedPoint={selectedPoint}
                flyTo={flyTo}
                onMapClick={handleMapClick}
                height="520px"
              />
              {selectedParcel && (
                <div className="mt-3 text-sm text-[#55606e] flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Wybrana działka: <strong className="text-[#37474f]">{selectedParcel.teryt ?? 'Punkt z mapy'}</strong> ({selectedParcel.areaHa} ha)
                    {selectedParcel.commune ? ` • ${selectedParcel.commune}, ${selectedParcel.voivodeship ?? ''}` : ''}
                  </span>
                  {resolvingParcel && <span className="text-[#1abc9c] font-semibold">Rozpoznawanie...</span>}
                </div>
              )}
            </div>
          )}
        </FlatCard>

        {report && <ReportView report={report} onError={(m) => show('error', m)} />}
      </div>
    );
  };
