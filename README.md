# AgroWoda KOWR — Inteligentny Asystent Gospodarowania Wodą w Rolnictwie

> **Zespół:** `Niekompetentni Profi`  
> **Zadanie konkursowe KOWR — HackNation 2026:** *„Zatrzymaj wodę, chroń plony – Inteligentne wsparcie gospodarowania wodą w rolnictwie”*

## Zwięzły opis rozwiązania (§4.1)

- **Problem:** Polska należy do krajów UE o najniższych zasobach wodnych i słabej retencji. Otwarte dane satelitarne, meteorologiczne, glebowe, wysokościowe i hydrologiczne są rozproszone w serwisach GIS (WFS/WMS, STAC GeoTIFF, reanalizy klimatyczne) i niedostępne dla przeciętnego rolnika w prostej, użytecznej formie.
- **Główne funkcjonalności:** Webowy asystent działający bez logowania i danych osobowych dla dowolnej działki ewidencyjnej w Polsce i dowolnej daty z ostatnich 10 lat. Realizuje ścisłą 5-etapową sekwencję KOWR: (1) ocena stanu wilgotności bieżącej i 10-letniej, (2) procentowa identyfikacja przyczyn deficytu, (3) rekomendacje retencji krajobrazowej i glebowej (NWRM — priorytet), (4) działania agrotechniczne, (5) opcjonalne, racjonalne nawadnianie FAO-56, a także zapis raportów w SQLite, porównywarkę do 4 działek oraz eksport PDF A4 i 5-arkuszowy Excel (`.xlsx`).
- **Sposób wykorzystania danych:** Równoległy pobór na żywo z 5 kategorii otwartych źródeł (GUGiK ULDK/KIEG/NMT 1 m, NASA POWER 10 lat + Open-Meteo + IMGW, Copernicus Sentinel-2 L2A COG, ISRIC SoilGrids v2.0, IMGW Hydro + OSM Overpass) przetwarzany przez deterministyczny silnik naukowy (FAO-56 Penman-Monteith, IUNG-PIB KBW₆₀, Saxton & Rawls 2006, reguły NWRM UE).
- **Najważniejsze korzyści dla użytkownika:** W 12–15 sekund rolnik bez znajomości GIS i bez opłat otrzymuje konkretny, uzasadniony liczbami plan zatrzymania wody na swojej działce, wskazanie najniższego punktu NMT pod mikroretencję, jawny poziom pewności wyniku oraz gotowy raport PDF/Excel.

### Zestaw materiałów konkursowych w repozytorium
- **Prezentacja (10 slajdów, 16:9):** `Prezentacja_AgroWoda_KOWR.pdf` (oraz edytowalna `Prezentacja_AgroWoda_KOWR.pptx`)
- **Pełna dokumentacja techniczna i operacyjna (21 stron):** `Dokumentacja_AgroWoda_KOWR.pdf`
- **Film demonstracyjny Full HD (1 min 22 s):** `Demo_AgroWoda_KOWR.mp4`
- **Wygenerowane przez prototyp raporty (PDF + XLSX):** katalog `raporty/`

---

## 1. Instrukcja uruchomienia rozwiązania (Windows / macOS / Linux)

Wymagania: **Node.js 20 lub 22+** (zalecane Node.js 22 — zero kompilacji natywnych dodatków C++ na Windows!).

```bash
# 1. Konfiguracja i uruchomienie backendu (API na porcie 5000 + Swagger UI /api-docs)
cd backend
cp .env.example .env      # na Windows PowerShell: Copy-Item .env.example .env
npm install
npm run dev

# 2. W drugim terminalu — uruchomienie frontendu (aplikacja webowa na porcie 3000)
cd frontend
npm install
npm run dev
```

Następnie otwórz w przeglądarce (Chrome, Edge, Firefox, Safari, Opera — również na urządzeniach mobilnych):
- **Aplikacja webowa:** `http://localhost:3000`
- **Dokumentacja API (Swagger UI):** `http://localhost:5000/api-docs`

Uruchomienie testów automatycznych i walidacji obliczeń naukowych:
```bash
cd backend && npm test
```

---

## 2. Podstawowe funkcjonalności

1. **Wskazanie dowolnej działki ewidencyjnej w Polsce** (bez logowania i zbierania danych osobowych):
   - wpisanie identyfikatora działki **TERYT** (np. `040704_2.0007.68` lub `141201_1.0001.6509`),
   - wyszukanie miejscowości / gminy (**GUGiK UUG**) lub kliknięcie pola bezpośrednio na interaktywnej mapie z podkładem satelitarnym (Esri World Imagery), OpenStreetMap oraz warstwą granic działek (**GUGiK KIEG WMS**),
   - 1-kliknięciowe przykłady z różnych regionów Polski do szybkiego przetestowania.
2. **Wybór uprawy i daty analizy (ostatnie 10 lat)**:
   - 12 kategorii upraw rolniczych zgodnych z **IUNG-PIB** oraz **FAO-56** (zboża ozime/jare, kukurydza, rzepak, ziemniak, burak cukrowy, strączkowe, warzywa gruntowe, sady, krzewy owocowe, truskawki, TUZ/łąki),
   - możliwość analizy zarówno **dnia bieżącego**, jak i **dowolnej daty historycznej z ostatnich 10 lat** (w tym walidacja historycznych susz, np. 2019 lub 2025).
3. **Ścisła 5-etapowa sekwencja wnioskowania naukowego KOWR** (wszystkie wskaźniki i rekomendacje wyliczane na żywo z danych źródłowych, brak sztywnych szablonów):
   - **Etap 1 — Ocena stanu wilgotności (bieżąca + 10-letnia podatność):** 60-dniowy Klimatyczny Bilans Wodny (`KBW_60 = Σ(P - ET0)`) wg IUNG-PIB, bilans uprawy (`P - ETc`) wg FAO-56 Penman-Monteith, 10-letnia częstość suszy i profil miesięcy krytycznych (`Mar–Paź`), kondycja roślinności Sentinel-2 (`NDVI`, `NDMI` z maską chmur `SCL` i interpretacją uwzględniającą fazę fenologiczną uprawy), retencja gleby (`AWC`, próchnica, kategoria IUNG I–IV).
   - **Etap 2 — Identyfikacja przyczyn niedoboru wody:** rozbicie procentowego wpływu (znormalizowane do 100%) klimatu, gleby, ukształtowania terenu, otoczenia krajobrazowego i wrażliwości uprawy — z konkretnymi dowodami liczbowymi.
   - **Etap 3 — Rekomendacje retencyjne (PRIORYTET — zasada „Retain Water Where It Falls” / NWRM):** spowalnianie odpływu w wykrytych rowach melioracyjnych, wskazanie na mapie **najniższego punktu działki z 1-metrowego NMT GUGiK** pod mikroretencję / nieckę infiltracyjną, pasy wiatrochronne, strefy buforowe, odbudowa próchnicy (*Soil Carbon 4 per mille*) i międzyplony dopasowane do uprawy.
   - **Etap 4 — Zabiegi agrotechniczne:** uprawa poprzecznostokowa (warunkowo przy spadku terenu `≥ 2%`), ograniczenie głębokiej orki (`strip-till`), płytkie zerwanie ścierniska, dobór odmian odporniejszych na suszę.
   - **Etap 5 — Opcjonalne nawadnianie (dopiero po ocenie retencji):** decyzja (`Niezalecane` / `Wstrzymaj — idzie opad` / `Monitoruj` / `Zasadne`), bezpieczna dawka polewowa FAO-56 (`mm`, `m³/ha`, `m³` na działkę) ograniczona pojemnością gleby (`22 / 28 / 35 mm`), uwzględnienie 7-dniowej prognozy opadów i wymogów Prawa wodnego.
4. **Transparentność, archiwum gospodarstwa i eksport raportu**:
   - każdy raport zawiera tabelę pochodzenia danych z datą i statusem pobrania, dynamicznie obliczony poziom pewności (%), jawne komunikaty o brakach danych oraz listę ograniczeń modelu,
   - **automatyczny zapis w SQLite** (zakładka *Zapisane Raporty* z **porównywarką do 4 działek gospodarstwa**), **wydruk / zapis PDF (A4)** oraz **5-arkuszowy eksport Excel (`.xlsx`)**.

---

## 3. Skrócony opis architektury

```
Przeglądarka rolnika (React 18 + TypeScript + Tailwind + Leaflet + SVG Charts)
        │  REST API (JSON / XLSX)
        ▼
Serwer obliczeniowy (Node.js 22 + Express + TypeScript)
 ├── parcelService.ts     ──► GUGiK ULDK + KIEG WMS GetFeatureInfo + GUGiK UUG
 ├── elevationService.ts  ──► GUGiK NMT 1m (EPSG:2180, siatka do 9 pkt) + fallback Open-Meteo DEM
 ├── meteoService.ts      ──► NASA POWER AG (10 lat, FAO-56 Penman-Monteith)
 │                            + Open-Meteo Forecast (ostatnie dni + prognoza 7d)
 │                            + IMGW-PIB Synop
 ├── satelliteService.ts  ──► AWS Earth Search STAC (Sentinel-2 L2A COG: B04/B08/B11/SCL)
 ├── soilService.ts       ──► ISRIC SoilGrids v2.0 + Saxton & Rawls (2006) + progi IUNG I–IV
 ├── hydrologyService.ts  ──► IMGW-PIB Hydro + OpenStreetMap Overpass (rowy, cieki, oczka)
 ├── waterEngine.ts       ──► Silnik sekwencji decyzyjnej KOWR (Etapy 1 → 5 + niepewność)
 ├── excelReportService.ts──► Generator 5-arkuszowego raportu ExcelJS (.xlsx)
 └── storageService.ts    ──► SQLite (`node:sqlite`, fallback JSON): cache API + zapisane raporty
```

Wszystkie 5 kategorii danych pobierane są **równolegle** (`Promise.all`), dzięki czemu typowy czas wygenerowania pełnego raportu wynosi **12–14 sekund** (ponad dwukrotnie szybciej niż preferowany przez Jury próg 30 sekund).

---

## 4. Źródła danych, zakresy oraz tryb pobierania (na bieżąco vs wcześniej)

**Wszystkie dane dla działki są pobierane na bieżąco (live) w momencie zapytania użytkownika** — żadne wyniki analiz ani rekomendacje nie zostały wcześniej przygotowane ani zapisane na sztywno. W lokalnej bazie SQLite działa wyłącznie warstwa pamięci podręcznej (TTL cache) chroniąca publiczne serwery API przed zbędnym powtarzaniem identycznych zapytań.

| Kategoria | Źródło | Zakres i rozdzielczość | Pobieranie / TTL Cache | Licencja / Warunki |
|---|---|---|---|---|
| **Przestrzenne (EGiB)** | [GUGiK ULDK](https://uldk.gugik.gov.pl/), [KIEG WMS](https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow), [GUGiK UUG](https://services.gugik.gov.pl/uug/) | Granice działek całej Polski (EPSG:4326 / 2180) | Na bieżąco (cache 14 dni) | Otwarte dane publiczne GUGiK (ustawa PGiK) |
| **Przestrzenne (Teren)** | [GUGiK NMT](https://services.gugik.gov.pl/nmt/) (fallback: [Open-Meteo Elevation](https://open-meteo.com/)) | Siatka do 9 pkt na działce; 1 m (NMT) / 30 m (DEM) | Na bieżąco (cache 30 dni) | Otwarte dane publiczne GUGiK / CC-BY 4.0 |
| **Meteorologiczne (10 lat)** | [NASA POWER Agroclimatology](https://power.larc.nasa.gov/), [Open-Meteo Forecast](https://open-meteo.com/en/terms), [IMGW-PIB Synop](https://danepubliczne.imgw.pl/apiinfo) | **10 lat dziennych danych** kończących się na `analysisDate` + prognoza 7d (dla dat bieżących) | Na bieżąco (cache 2–12 h; IMGW 30 min) | NASA Public Domain / CC-BY 4.0 / Dane Publiczne IMGW |
| **Satelitarne** | [Copernicus Sentinel-2 L2A (AWS Earth Search STAC)](https://earth-search.aws.element84.com/v1) | Pasma B04/B08 (10 m), B11/SCL (20 m) z okna 60 dni + rok referencyjny (HTTP Range COG) | Na bieżąco (cache 24 h) | Copernicus Free, Full and Open Data Policy |
| **Glebowe** | [ISRIC SoilGrids v2.0](https://docs.isric.org/globaldata/soilgrids/) | Profil 0–60 cm (4 warstwy: piasek, pył, ił, SOC, gęstość), 250 m | Na bieżąco (cache 30 dni) | CC-BY 4.0 (ISRIC World Soil Information) |
| **Hydrologiczne** | [IMGW-PIB Hydro](https://danepubliczne.imgw.pl/apiinfo), [OpenStreetMap Overpass](https://overpass-api.de/) | Wodowskazy IMGW + sieć rowów, cieków, oczek wodnych i zadrzewień (1,5 km) | Na bieżąco (cache 30 min / 7 dni) | Dane Publiczne IMGW / ODbL (OSM) |
| **Stałe tablice upraw (wiedza dziedzinowa)** | Publikacje FAO-56 (Rev. 1, 2025) oraz IUNG-PIB (`backend/src/data/crops.ts`) | Parametry 12 grup upraw (`Kc`, głębokość korzeni `Zr`, progi `KBW_60` I–IV) | Opracowane jednorazowo: **2026-11-21** | Otwarta wiedza naukowa (FAO / IUNG-PIB) |

---

## 5. Wykaz bibliotek, komponentów, modeli i narzędzi AI oraz licencje

Wszystkie komponenty oprogramowania wykorzystują otwarte, liberalne licencje OSI (MIT, BSD-2-Clause, ISC, Apache-2.0) w pełni zgodne z §2 ust. 10 i §5 Regulaminu:

- **Backend:** `express` (MIT), `cors` (MIT), `dotenv` (BSD-2-Clause), `swagger-ui-express` (MIT), `exceljs` (MIT), `geotiff` (MIT), `proj4` (MIT), `typescript` (Apache-2.0), `jest` / `supertest` (MIT), wbudowany moduł Node.js `node:sqlite` (MIT).
- **Frontend:** `react`, `react-dom`, `react-router-dom` (MIT), `vite` (MIT), `tailwindcss` (MIT), `leaflet` (BSD-2-Clause), `lucide-react` (ISC), `axios` (MIT).
- **Modele obliczeniowe:** deterministyczny, w pełni wyjaśnialny silnik hydro-agronomiczny (FAO-56 Penman-Monteith, Saxton & Rawls 2006, klasyfikacja progowa IUNG-PIB, reguły NWRM UE). Aplikacja **nie korzysta z zewnętrznych płatnych modeli LLM w trakcie działania** — brak halucynacji, pełna powtarzalność i zerowy koszt tokenów.
- **Zakres użycia narzędzi AI (§4.2 pkt 6, §5.1):** narzędzia AI (Google Antigravity / Gemini) zostały wykorzystane wyłącznie na etapie projektowania, pisania kodu źródłowego, generowania grafiki okładkowej oraz redakcji dokumentacji i prezentacji, przy pełnej weryfikacji testami automatycznymi i na żywych danych API.

---

## 6. Znane ograniczenia techniczne i merytoryczne

1. **Rozdzielczość przestrzenna danych:** siatka meteorologiczna NASA POWER (~50 km) oraz Open-Meteo (~9 km) nie wychwytuje punktowych letnich opadów burzowych; ISRIC SoilGrids (250 m) jest modelem statystycznym i nie zastępuje lokalnej odkrywki glebowej ani laboratoryjnego badania próchnicy i pH.
2. **Zachmurzenie w danych satelitarnych:** w okresach długotrwałego zachmurzenia brak bezchmurnej sceny Sentinel-2 w oknie 60 dni — aplikacja informuje o tym wprost i obniża wskaźnik pewności.
3. **Dane IMGW-PIB w analizach historycznych:** publiczne API IMGW udostępnia wyłącznie bieżące stany wodowskazowe i synoptyczne — dla dat historycznych system celowo je wyłącza.
4. **Czynniki terenowe poza danymi otwartymi:** stan techniczny podziemnej sieci drenarskiej (sączków), poziom wód gruntowych poniżej 1 m, rzeczywista data siewu i odmiana uprawy oraz stan prawny urządzeń melioracyjnych.
5. **Dostępność publicznych serwerów zewnętrznych:** serwery ULDK, SoilGrids lub Overpass OSM bywają okresowo przeciążone (zabezpieczono przez detekcję tarpitu ULDK + fallback KIEG WMS, wieloserwerowy Overpass, twarde timeouty oraz jawną komunikację braków w raporcie).

---

## 7. Sposób weryfikacji wygenerowanych wyników i rekomendacji

1. **Testy automatyczne (`backend/src/__tests__/water.test.ts` — 7/7 PASS):**
   - weryfikacja fizycznych zakresów FAO-56 Penman-Monteith (lato vs zima w Polsce),
   - weryfikacja modelu Saxton & Rawls (2006) i klasyfikacji IUNG I–IV (gleba piaszczysta vs gliniasta),
   - weryfikacja parsowania geometrii WKT z ULDK, krzywej fenologicznej `Kc`, walidacji granic Polski i zakresu 10 lat oraz pełnego przepływu REST API (`POST /api/analyze` → zapis → eksport `.xlsx` → usunięcie).
2. **Walidacja na żywo dla rzeczywistych działek i lat suszowych:**
   - zweryfikowano dla działek z Kujaw (`040704_2.0007.68`, czerwiec 2019 — potwierdzona susza IUNG; czerwiec 2025 — kukurydza) oraz Mazowsza (`141201_1.0001.6509` — okres pozasezonowy). Przykładowe wygenerowane raporty znajdują się w katalogu `raporty/`.

---

## 8. Skalowalność w skali kraju (plan rozwoju produkcyjnego — §5.5)

Prototyp obsługuje dowolne działki ewidencyjne w Polsce, natomiast wdrożenie dla 50–100 tys. aktywnych rolników miesięcznie (np. w ramach portalu KOWR / eWniosekPlus) wymagałoby:
1. **Obsługi limitów zewnętrznych API:** przeniesienie cache do **Redis + PostgreSQL/PostGIS** oraz lokalna kopia statycznych zbiorów GUGiK (eksport EGiB Parquet z `opendata.geoportal.gov.pl`, krajowy NMT 1 m, mapa gleb IUNG) — odpowiedź `< 300 ms` i niezależność od limitów API.
2. **Aktualizacji danych i ruchu szczytowego:** nocne zadania wsadowe dla siatek IMGW/ERA5, przeliczanie indeksów Sentinel-2 co 5 dni dla siatki obrębów, kolejki BullMQ dla analiz całych gospodarstw oraz CDN dla frontendu.
3. **Szacunkowych kosztów infrastruktury:** klaster aplikacyjny + PostGIS + Redis w chmurze UE lub Chmurze Krajowej: ok. **3 000–7 000 zł/mies.** Wszystkie publiczne źródła danych (GUGiK, Copernicus, IMGW, NASA POWER, SoilGrids, OSM) pozostają w **100% bezpłatne (0 zł)**.
