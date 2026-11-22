"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildProvenanceAndLimitations = exports.buildIrrigationAdvice = exports.buildRecommendations = exports.identifyCauses = exports.buildWaterAssessment = exports.classifyRiskLevel = void 0;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const classifyRiskLevel = (score) => {
    if (score >= 83)
        return { level: 'krytyczny', labelPl: 'Krytyczny deficyt wody' };
    if (score >= 65)
        return { level: 'wysoki', labelPl: 'Wysokie ryzyko / Susza rolnicza' };
    if (score >= 45)
        return { level: 'podwyzszony', labelPl: 'Podwyższone ryzyko suszy' };
    if (score >= 25)
        return { level: 'umiarkowany', labelPl: 'Umiarkowany niedobór wilgoci' };
    return { level: 'optymalny', labelPl: 'Optymalne uwilgotnienie' };
};
exports.classifyRiskLevel = classifyRiskLevel;
/**
 * ETAP 1: Ocena stanu wilgotności (bieżąca + wieloletnia 10-letnia podatność)
 */
const buildWaterAssessment = (ctx) => {
    const { crop, meteo, soil, satellite, elevation } = ctx;
    const effectiveCat = soil.iungCategory ?? 2;
    const iungThreshold = crop.iungKbwThresholdMm[effectiveCat];
    const kbw60 = meteo.available ? meteo.current.kbw60dMm : null;
    const kbwMargin = kbw60 !== null ? round(kbw60 - iungThreshold, 1) : null;
    const exceedsIung = kbwMargin !== null ? kbwMargin <= 0 : false;
    // --- Składowe bieżącego ryzyka suszy (0..100) ---
    let currentScore = 25; // Punkt wyjścia przy braku danych
    if (meteo.available) {
        // 1. Klimatyczny Bilans Wodny 60d względem progu IUNG (waga 42%)
        // Jeśli KBW >= 0 -> 0 pkt; jeśli KBW == próg IUNG -> 75 pkt; poniżej progu -> do 100 pkt
        const kbwScore = kbw60 >= 20
            ? 0
            : kbw60 >= 0
                ? ((20 - kbw60) / 20) * 15
                : clamp(15 + (Math.abs(kbw60) / Math.abs(iungThreshold)) * 65, 15, 100);
        // 2. Krótkoterminowy stres opadowy (30d bilans uprawy + ciąg dni bezopadowych, waga 22%)
        const drySpellScore = clamp((meteo.current.consecutiveDryDays / 18) * 65 + (meteo.current.longestDrySpell60d / 25) * 35, 0, 100);
        const shortTermDeficitScore = clamp((-meteo.current.cropBalance30dMm / 110) * 100, 0, 100);
        const meteoShortScore = 0.55 * shortTermDeficitScore + 0.45 * drySpellScore;
        // 3. Uwilgotnienie profilu glebowego z modelu (waga 16%)
        const rootWet = meteo.current.soilWetnessRootPct ?? meteo.current.soilWetnessTopPct;
        const moistureScore = rootWet !== null ? clamp(((78 - rootWet) / 55) * 100, 0, 100) : kbwScore * 0.85;
        // 4. Sygnał satelitarny Sentinel-2 (waga 12%, wyłącznie w sezonie wegetacyjnym)
        let satScore = kbwScore * 0.7;
        let satWeight = 0;
        if (satellite.available && satellite.vegetationStatus !== 'poza_wegetacja_lub_gleba') {
            satWeight = 0.14;
            satScore =
                satellite.vegetationStatus === 'silny_stres'
                    ? 92
                    : satellite.vegetationStatus === 'umiarkowany_stres'
                        ? 68
                        : satellite.vegetationStatus === 'lekki_stres'
                            ? 44
                            : 14;
        }
        // 5. Podatność glebowa + spływ stokowy (waga 8–12%)
        const soilFactor = soil.iungCategory === 1 ? 82 : soil.iungCategory === 2 ? 62 : soil.iungCategory === 3 ? 38 : soil.iungCategory === 4 ? 18 : 50;
        const slopeFactor = elevation.runoffRisk === 'wysoki' ? 75 : elevation.runoffRisk === 'umiarkowany' ? 45 : 15;
        const siteFactor = 0.7 * soilFactor + 0.3 * slopeFactor;
        const baseMeteoWeight = satWeight > 0 ? 0.76 : 0.88;
        const meteoComposite = 0.52 * kbwScore + 0.28 * meteoShortScore + 0.2 * moistureScore;
        currentScore = baseMeteoWeight * meteoComposite + satWeight * satScore + 0.12 * siteFactor;
        // Poza sezonem wegetacyjnym (listopad–marzec) ryzyko bieżącej suszy roślinnej jest łagodzone,
        // ale zachowujemy sygnał niedoboru zapasów wody pozimowej!
        if (!meteo.current.isGrowingSeason) {
            currentScore = currentScore * 0.62;
        }
    }
    currentScore = Math.round(clamp(currentScore, 0, 100));
    const curClass = (0, exports.classifyRiskLevel)(currentScore);
    // --- Podatność wieloletnia (10 lat, 0..100) ---
    let histScore = 40;
    if (meteo.available) {
        const freqScore = meteo.historical10y.droughtFrequencyPct; // np. 60% lat z suszą -> 60
        const annualPrecipScore = clamp(((650 - meteo.historical10y.avgAnnualPrecipMm) / 230) * 100, 0, 100);
        const worstMonthlyRisk = meteo.historical10y.monthlyProfile.length > 0
            ? Math.max(...meteo.historical10y.monthlyProfile.map((m) => m.riskScore))
            : 45;
        const soilVuln = soil.iungCategory === 1 ? 88 : soil.iungCategory === 2 ? 66 : soil.iungCategory === 3 ? 40 : soil.iungCategory === 4 ? 22 : 50;
        histScore = Math.round(clamp(0.4 * freqScore + 0.25 * worstMonthlyRisk + 0.15 * annualPrecipScore + 0.2 * soilVuln, 0, 100));
    }
    const histClass = (0, exports.classifyRiskLevel)(histScore);
    // Szacowany zapas wody dostępnej w strefie korzeniowej (%)
    let estReservePct = null;
    if (meteo.available) {
        if (meteo.current.soilWetnessRootPct !== null) {
            estReservePct = meteo.current.soilWetnessRootPct;
        }
        else if (soil.awcRootZoneMm && kbw60 !== null) {
            estReservePct = Math.round(clamp(75 + (kbw60 / Math.max(80, soil.awcRootZoneMm * 1.4)) * 75, 5, 100));
        }
    }
    // Syntetyczne podsumowanie dla rolnika (prosty, konkretny język — 2–3 zdania)
    const keyFindingsPl = [];
    if (meteo.available) {
        keyFindingsPl.push(`60-dniowy Klimatyczny Bilans Wodny (KBW) wynosi ${kbw60 >= 0 ? '+' : ''}${kbw60} mm wobec progu suszy IUNG-PIB ${iungThreshold} mm dla uprawy „${crop.namePl}” na glebie kategorii ${effectiveCat} (${exceedsIung ? 'próg suszy przekroczony!' : `zapas ${kbwMargin} mm do progu suszy`}).`);
        keyFindingsPl.push(`W ujęciu 10-letnim (${meteo.historyStart.slice(0, 4)}–${meteo.historyEnd.slice(0, 4)}) niedobory przekraczające próg suszy występowały w ${meteo.historical10y.droughtYearsCount} z ${Math.min(10, meteo.yearsAnalyzed)} sezonów (${meteo.historical10y.droughtFrequencyPct}%), a największe ryzyko niedoboru wody przypada ${meteo.historical10y.peakRiskPeriodPl}.`);
    }
    if (soil.available && soil.awc60cmMm !== null) {
        keyFindingsPl.push(`Gleba (${soil.textureClassPl ?? soil.iungCategoryLabelPl}) magazynuje ok. ${soil.awc60cmMm} mm wody użytecznej w warstwie 0–60 cm${soil.humusPct !== null ? ` przy zawartości próchnicy ok. ${soil.humusPct}%` : ''}.`);
    }
    if (satellite.available && satellite.ndvi && satellite.ndmi) {
        keyFindingsPl.push(`Satelita Sentinel-2 (${satellite.sceneDate}): NDVI = ${satellite.ndvi.mean.toFixed(2)}, NDMI = ${satellite.ndmi.mean.toFixed(2)} — ${satellite.vegetationStatus === 'optymalna'
            ? 'dobra kondycja roślinności'
            : satellite.vegetationStatus === 'poza_wegetacja_lub_gleba'
                ? 'okres pozasiewny / gleba odkryta'
                : 'widoczne oznaki stresu wodnego uprawy'}.`);
    }
    let executiveSummaryPl = '';
    if (!meteo.available) {
        executiveSummaryPl =
            'Nie udało się pobrać danych meteorologicznych — ocena bieżąca jest niepełna. Zweryfikuj połączenie z API i powtórz analizę.';
    }
    else if (curClass.level === 'krytyczny' || curClass.level === 'wysoki') {
        executiveSummaryPl = `Na działce w dniu ${meteo.analysisDate} występuje ${curClass.labelPl.toLowerCase()} dla uprawy ${crop.namePl.toLowerCase()} (KBW 60-dniowy: ${kbw60} mm, opad 30-dniowy: ${meteo.current.precip30dMm} mm). Priorytetem jest natychmiastowe ograniczenie parowania glebowego, zatrzymywanie każdego opadu w glebie oraz ocena zasadności interwencyjnego nawadniania.`;
    }
    else if (curClass.level === 'podwyzszony') {
        executiveSummaryPl = `Na analizowanej działce występuje podwyższone ryzyko niedoboru wody (${meteo.current.phenologyStagePl.toLowerCase()}, KBW 60-dniowy: ${kbw60} mm). W skali 10 lat teren wykazuje ${histClass.labelPl.toLowerCase()} — kluczowe jest wdrożenie zabiegów retencji glebowej i krajobrazowej przed okresem szczytowego deficytu (${meteo.historical10y.peakRiskPeriodPl}).`;
    }
    else if (curClass.level === 'umiarkowany') {
        executiveSummaryPl = `Bieżący stan uwilgotnienia działki (${meteo.analysisDate}) wykazuje umiarkowany niedobór wody (KBW 60-dniowy: ${kbw60} mm), bez przekroczenia krytycznego progu suszy rolniczej. Zalecany jest bieżący monitoring w okresie ${meteo.historical10y.peakRiskPeriodPl} oraz działania zapobiegawcze zwiększające retencję glebową.`;
    }
    else {
        executiveSummaryPl = `Na dzień ${meteo.analysisDate} sytuacja wodna działki dla uprawy ${crop.namePl.toLowerCase()} jest stabilna (KBW 60-dniowy: ${kbw60 >= 0 ? '+' : ''}${kbw60} mm, bez oznak suszy bieżącej). ${histScore >= 45
            ? `Uwaga: w ujęciu 10-letnim działka jest jednak narażona na okresowe susze (${meteo.historical10y.droughtYearsCount}/10 lat, szczyt ${meteo.historical10y.peakRiskPeriodPl}) — warto wykorzystać okres nadwyżki do gromadzenia wody i poprawy retencji.`
            : 'Warto utrzymywać praktyki chroniące strukturę gleby i materię organiczną, aby zachować wysoką odporność na przyszłe okresy bezopadowe.'}`;
    }
    return {
        currentRiskScore: currentScore,
        currentRiskLevel: curClass.level,
        currentRiskLabelPl: curClass.labelPl,
        historicalRiskScore: histScore,
        historicalRiskLevel: histClass.level,
        historicalRiskLabelPl: histClass.labelPl,
        iungThresholdUsedMm: iungThreshold,
        kbw60dMm: kbw60,
        kbwMarginToThresholdMm: kbwMargin,
        exceedsIungDroughtThreshold: exceedsIung,
        estimatedSoilMoistureReservePct: estReservePct,
        executiveSummaryPl,
        keyFindingsPl,
    };
};
exports.buildWaterAssessment = buildWaterAssessment;
/**
 * ETAP 2: Identyfikacja przyczyn ograniczonej dostępności wody (Root Cause Diagnosis)
 */
const identifyCauses = (ctx) => {
    const { crop, meteo, soil, elevation, hydrology, satellite } = ctx;
    const rawCauses = [];
    // 1. Deficyt klimatyczno-opadowy i stres termiczny
    if (meteo.available) {
        const kbwDef = Math.max(0, -meteo.current.kbw60dMm);
        const rainPct = meteo.anomalies.precip60dPctOfNormal;
        const tempAnom = meteo.anomalies.temp30dAnomalyC;
        const weight = clamp((kbwDef / 180) * 55 +
            (meteo.current.longestDrySpell60d / 20) * 25 +
            Math.max(0, tempAnom) * 7 +
            (meteo.historical10y.droughtFrequencyPct / 100) * 20, 5, 100);
        const severity = weight >= 55 ? 'wysoka' : weight >= 30 ? 'srednia' : 'niska';
        const evidence = [
            `Opady 60-dniowe: ${meteo.current.precip60dMm} mm (${rainPct}% normy 10-letniej wynoszącej ${meteo.anomalies.precip60dNormalMm} mm)`,
            `Ewapotranspiracja ET₀ (60d): ${meteo.current.et060dMm} mm → KBW = ${meteo.current.kbw60dMm >= 0 ? '+' : ''}${meteo.current.kbw60dMm} mm`,
            `Najdłuższy ciąg bezopadowy (60d): ${meteo.current.longestDrySpell60d} dni (bieżący: ${meteo.current.consecutiveDryDays} dni)`,
            `Średnia temp. 30d: ${meteo.current.tempMean30d}°C (odchylenie ${tempAnom >= 0 ? '+' : ''}${tempAnom}°C od normy 10-letniej)`,
        ];
        rawCauses.push({
            id: 'climate_deficit',
            category: 'klimat',
            titlePl: kbwDef > 80 || rainPct < 75
                ? 'Deficyt opadów i podwyższone parowanie (stres klimatyczny)'
                : 'Sezonowa zmienność opadów i presja parowania w regionie',
            severity,
            contributionPct: 0,
            explanationPl: kbwDef > 80
                ? `Straty wody wskutek ewapotranspiracji (${meteo.current.et060dMm} mm) znacząco przewyższają zasilanie opadowe (${meteo.current.precip60dMm} mm). W skali 10 lat średni roczny opad wynosi ${meteo.historical10y.avgAnnualPrecipMm} mm, a deficyty powtarzają się szczególnie ${meteo.historical10y.peakRiskPeriodPl}.`
                : `Bieżący dopływ opadów (${meteo.current.precip60dMm} mm/60d) nie generuje ostrego deficytu, jednak w 10-letniej historii działki susze pojawiały się w ${meteo.historical10y.droughtYearsCount} na ${Math.min(10, meteo.yearsAnalyzed)} sezonów (szczyt: ${meteo.historical10y.peakRiskPeriodPl}).`,
            evidencePl: evidence,
            rawWeight: weight,
        });
    }
    // 2. Ograniczona pojemność wodna gleby i zawartość próchnicy
    if (soil.available) {
        const isLight = soil.iungCategory === 1 || soil.iungCategory === 2;
        const lowHumus = soil.humusPct !== null && soil.humusPct < 2.2;
        const weight = clamp((soil.iungCategory === 1 ? 82 : soil.iungCategory === 2 ? 60 : soil.iungCategory === 3 ? 30 : 15) +
            (lowHumus ? 16 : 0), 10, 100);
        const evidence = [];
        if (soil.sandPct !== null && soil.siltPct !== null && soil.clayPct !== null) {
            evidence.push(`Uziarnienie (0–60 cm): piasek ${soil.sandPct}%, pył ${soil.siltPct}%, ił ${soil.clayPct}% (${soil.textureClassPl})`);
        }
        if (soil.awc60cmMm !== null) {
            evidence.push(`Retencja użyteczna AWC: ${soil.awc60cmMm} mm w warstwie 0–60 cm (${soil.awcRootZoneMm} mm w strefie korzeniowej ${crop.rootDepthM} m)`);
        }
        if (soil.humusPct !== null) {
            evidence.push(`Zawartość próchnicy: ~${soil.humusPct}% (węgiel organiczny SOC: ${soil.organicCarbonGKg} g/kg)`);
        }
        evidence.push(`Klasa podatności IUNG-PIB: ${soil.iungCategoryLabelPl}`);
        rawCauses.push({
            id: 'soil_retention',
            category: 'gleba',
            titlePl: isLight
                ? 'Niska zdolność gleby do magazynowania wody (gleba lekka / przepuszczalna)'
                : lowHumus
                    ? 'Obniżona zawartość materii organicznej (próchnicy) ograniczająca retencję'
                    : 'Właściwości retencyjne profilu glebowego',
            severity: weight >= 60 ? 'wysoka' : weight >= 35 ? 'srednia' : 'niska',
            contributionPct: 0,
            explanationPl: isLight
                ? `Wysoki udział frakcji piaszczystej sprawia, że woda opadowa szybko przesiąka poza strefę korzeniową, a gleba ma niewielki zapas wody użytecznej (${soil.awc60cmMm ?? '—'} mm w 0–60 cm). ${lowHumus ? 'Dodatkowo niska zawartość próchnicy (<2,2%) osłabia strukturę gruzełkowatą i pojemność wodną.' : ''}`
                : `Gleba posiada ${soil.iungCategory === 4 ? 'dobrą' : 'umiarkowaną'} pojemność wodną (${soil.awc60cmMm ?? '—'} mm w 0–60 cm). ${lowHumus ? 'Zwiększenie zawartości próchnicy (obecnie ok. ' + soil.humusPct + '%) dodatkowo poprawi infiltrację i odporność na zaskorupianie.' : 'Kluczowe jest utrzymanie drożnej struktury gruzełkowatej, aby opady mogły wnikać w głąb profilu zamiast spływać.'}`,
            evidencePl: evidence,
            rawWeight: weight,
        });
    }
    // 3. Spływ powierzchniowy, nachylenie terenu i opady nawalne
    if (elevation.available) {
        const slope = elevation.meanSlopePct ?? 0;
        const maxSlope = elevation.maxSlopePct ?? 0;
        const southFacing = elevation.aspectDeg !== null && elevation.aspectDeg >= 135 && elevation.aspectDeg <= 225;
        const heavyDays = meteo.available ? meteo.current.heavyRainDays60d : 0;
        const heavyShare = meteo.available ? meteo.current.heavyRainSharePct60d : 0;
        const weight = clamp(slope * 12 + (maxSlope > 4 ? 15 : 0) + (southFacing && slope > 1.5 ? 10 : 0) + heavyDays * 8 + (heavyShare > 35 ? 12 : 0), 8, 90);
        const evidence = [
            `Średni spadek działki (NMT): ${slope}% (maks. lokalny: ${maxSlope}%, deniwelacja: ${elevation.reliefM} m)`,
            `Ekspozycja stoku: ${elevation.aspectLabelPl}`,
        ];
        if (meteo.available) {
            evidence.push(`Opady nawalne (≥20 mm/d): ${heavyDays} dni w ostatnich 60 dniach (${heavyShare}% sumy opadu; średnio ${meteo.historical10y.avgAnnualHeavyRainDays} dni/rok w 10-leciu)`);
        }
        if (slope >= 1.5 || heavyDays >= 1 || weight >= 22) {
            rawCauses.push({
                id: 'surface_runoff',
                category: 'topografia',
                titlePl: slope >= 3
                    ? 'Nadmierny spływ powierzchniowy na terenie nachylonym'
                    : heavyDays >= 1
                        ? 'Straty wody z opadów nawalnych i mikroukształtowania terenu'
                        : 'Wpływ rzeźby terenu i ekspozycji na obieg wody',
                severity: weight >= 55 ? 'wysoka' : weight >= 28 ? 'srednia' : 'niska',
                contributionPct: 0,
                explanationPl: slope >= 2.5
                    ? `Nachylenie terenu (${slope}%, lokalnie do ${maxSlope}%) przyspiesza spływ wody opadowej w kierunku najniższej części działki zamiast jej wsiąkania.${southFacing ? ' Ekspozycja południowa dodatkowo zwiększa nagrzewanie gleby i straty na parowanie.' : ''}`
                    : `Teren jest stosunkowo płaski (${slope}%), jednak podczas intensywnych opadów nawalnych (≥20 mm/d) część wody może odpływać w stronę lokalnych obniżeń (różnica wysokości ${elevation.reliefM} m) bez pełnej infiltracji.`,
                evidencePl: evidence,
                rawWeight: weight,
            });
        }
    }
    // 4. Niedobór elementów retencji krajobrazowej / nadmierne odwadnianie
    if (hydrology.osmAvailable) {
        const lacksPonds = hydrology.pondsAndWetlandsCount1000m === 0;
        const lacksTrees = hydrology.shelterbeltsAndWoodsCount1000m <= 1;
        const closeDitch = hydrology.nearestDitchOrDrain !== null && hydrology.nearestDitchOrDrain.distanceM <= 500;
        const weight = clamp((lacksPonds ? 28 : 10) + (lacksTrees ? 24 : 8) + (closeDitch ? 20 : 0), 10, 80);
        const evidence = [
            `Oczka wodne i mokradła (promień 1 km): ${hydrology.pondsAndWetlandsCount1000m}`,
            `Zadrzewienia i pasy wiatrochronne (promień 1 km): ${hydrology.shelterbeltsAndWoodsCount1000m}`,
            hydrology.nearestDitchOrDrain
                ? `Najbliższy rów melioracyjny: ${hydrology.nearestDitchOrDrain.distanceM} m (${hydrology.nearestDitchOrDrain.name ?? hydrology.nearestDitchOrDrain.labelPl})`
                : `Najbliższy ciek wodny: ${hydrology.nearestWatercourse ? `${hydrology.nearestWatercourse.distanceM} m` : 'brak w promieniu 1,5 km'}`,
        ];
        rawCauses.push({
            id: 'landscape_deficit',
            category: 'krajobraz',
            titlePl: closeDitch
                ? 'Szybki odpływ wód przez sieć rowów i niska retencja krajobrazowa'
                : 'Uproszczony krajobraz rolniczy (brak elementów spowalniających obieg wody)',
            severity: weight >= 55 ? 'wysoka' : weight >= 32 ? 'srednia' : 'niska',
            contributionPct: 0,
            explanationPl: `${lacksPonds ? 'W promieniu 1 km brakuje oczek wodnych i mokradeł zatrzymujących wodę w krajobrazie. ' : ''}${lacksTrees ? 'Niewielka liczba zadrzewień śródpolnych nasila parowanie wiatrowe z powierzchni pola. ' : ''}${closeDitch ? 'Bliskość rowu melioracyjnego może przyspieszać odwadnianie działki, jeśli nie jest on wyposażony w zastawki piętrzące.' : ''}`.trim(),
            evidencePl: evidence,
            rawWeight: weight,
        });
    }
    // 5. Wymagania wodne i wrażliwość wybranej uprawy
    const isCriticalMonth = crop.criticalMonths.includes(Number(meteo.analysisDate.slice(5, 7)));
    const satStressBoost = satellite.vegetationStatus === 'silny_stres' ? 30 : satellite.vegetationStatus === 'umiarkowany_stres' ? 18 : 0;
    const cropWeight = clamp(crop.droughtSensitivity * 10 + (isCriticalMonth ? 22 : 6) + satStressBoost, 12, 85);
    const cropEvidence = [
        `Uprawa: ${crop.namePl} — wrażliwość na suszę ${crop.droughtSensitivity}/5, głębokość korzeni Zr ≈ ${crop.rootDepthM} m`,
        `Aktualna faza fenologiczna: ${meteo.current.phenologyStagePl} (współczynnik FAO-56 Kc = ${meteo.current.kcCurrent})`,
        `Okres krytyczny dla plonu: ${crop.criticalStagesPl}`,
    ];
    if (satellite.available && satellite.ndmi && satellite.ndvi) {
        cropEvidence.push(`Obserwacja Sentinel-2 (${satellite.sceneDate}): NDVI = ${satellite.ndvi.mean.toFixed(2)}, NDMI = ${satellite.ndmi.mean.toFixed(2)}`);
    }
    rawCauses.push({
        id: 'crop_sensitivity',
        category: 'uprawa',
        titlePl: isCriticalMonth
            ? `Wysokie zapotrzebowanie wodne uprawy „${crop.namePl}” w krytycznej fazie rozwoju`
            : `Specyfika i wrażliwość wodna uprawy „${crop.namePl}”`,
        severity: cropWeight >= 55 ? 'wysoka' : cropWeight >= 35 ? 'srednia' : 'niska',
        contributionPct: 0,
        explanationPl: crop.rootDepthM <= 0.65
            ? `${crop.namePl} tworzy płytki system korzeniowy (ok. ${Math.round(crop.rootDepthM * 100)} cm), przez co szybko odczuwa przesychanie wierzchniej warstwy gleby (woda łatwo dostępna RAW to zaledwie ${soil.rawRootZoneMm ?? '—'} mm).`
            : `${crop.namePl} wymaga stabilnego zaopatrzenia w wodę szczególnie w okresie: ${crop.criticalStagesPl.toLowerCase()}. ${isCriticalMonth ? 'Wybrana data przypada bezpośrednio na okres krytyczny dla kształtowania plonu.' : 'Obecna data leży poza głównym szczytem krytycznym uprawy.'}`,
        evidencePl: cropEvidence,
        rawWeight: cropWeight,
    });
    // Normalizacja udziałów procentowych (suma = 100%) i sortowanie od najważniejszej przyczyny
    rawCauses.sort((a, b) => b.rawWeight - a.rawWeight);
    const totalW = rawCauses.reduce((s, c) => s + c.rawWeight, 0) || 1;
    let assigned = 0;
    return rawCauses.map((c, idx) => {
        const pct = idx === rawCauses.length - 1 ? Math.max(1, 100 - assigned) : Math.max(1, Math.round((c.rawWeight / totalW) * 100));
        assigned += pct;
        const { rawWeight: _ignored, ...clean } = c;
        return { ...clean, contributionPct: pct };
    });
};
exports.identifyCauses = identifyCauses;
/**
 * ETAP 3 i 4: Rekomendacje retencyjne (krajobrazowe + glebowe) oraz działania agrotechniczne.
 * Każda rekomendacja wynika bezpośrednio z Etapu 1 i 2 oraz danych przestrzennych/glebowych/hydrologicznych.
 */
const buildRecommendations = (ctx) => {
    const { parcel, crop, meteo, soil, elevation, hydrology, assessment, farmOptions } = ctx;
    const retention = [];
    const agrotech = [];
    const highRisk = assessment.currentRiskScore >= 45 || assessment.historicalRiskScore >= 45;
    const slope = elevation.meanSlopePct ?? 0;
    const maxSlope = elevation.maxSlopePct ?? 0;
    // === ETAP 3A: RETENCJA KRAJOBRAZOWA (Zasada "Retain Water Where It Falls" — NWRM UE) ===
    // 1. Retencja korytowa na rowach melioracyjnych (gdy OSM wykrył rów w promieniu 750 m)
    if (hydrology.nearestDitchOrDrain && hydrology.nearestDitchOrDrain.distanceM <= 750) {
        const d = hydrology.nearestDitchOrDrain;
        retention.push({
            id: 'nwrm_ditch_weir',
            stage: 'retencja_krajobrazowa',
            priority: 'wysoki',
            titlePl: 'Okresowe piętrzenie wód w pobliskim rowie melioracyjnym (zastawki)',
            descriptionPl: `Zastosuj zastawki lub progi spowalniające odpływ na rowie melioracyjnym w okresie wiosennych roztopów i po intensywnych opadach (funkcja nawadniająco-odwadniająca). Pozwala to podnieść lokalny poziom wód gruntowych w strefie podsiąku kapilarnego na przyległej działce. Działanie należy uzgodnić z lokalną spółką wodną lub PGW Wody Polskie.`,
            dataJustificationPl: `Dane hydrograficzne OSM wykazały ${d.labelPl.toLowerCase()}${d.name ? ` („${d.name}”)` : ''} w odległości ok. ${d.distanceM} m od działki, przy ${meteo.historical10y.droughtYearsCount}/10 latach z deficytem wody (szczyt ${meteo.historical10y.peakRiskPeriodPl}).`,
            expectedEffectPl: 'Podniesienie zwierciadła wód gruntowych o 20–50 cm w strefie przyległej i ograniczenie odpływu pozimowego.',
            horizonPl: 'ten_sezon',
            mapLocation: { lat: d.lat, lng: d.lng, labelPl: `${d.labelPl} (${d.distanceM} m)` },
        });
    }
    // 2. Mikroretencja w lokalnym obniżeniu działki (wyznaczonym z 1-metrowego NMT GUGiK!)
    if (elevation.available && elevation.lowestPoint && (elevation.reliefM >= 1.0 || slope >= 1.5 || meteo.historical10y.avgAnnualHeavyRainDays >= 2)) {
        const lp = elevation.lowestPoint;
        retention.push({
            id: 'nwrm_micro_basin',
            stage: 'retencja_krajobrazowa',
            priority: slope >= 2.5 || elevation.reliefM >= 2.5 ? 'wysoki' : 'sredni',
            titlePl: 'Wykonanie niecki infiltracyjnej lub małego zbiornika retencyjnego w najniższej części działki',
            descriptionPl: `W najniżej położonym fragmencie działki (gdzie naturalnie spływają wody opadowe) warto wydzielić trawiastą nieckę infiltracyjną, muldę chłonną lub małe oczko retencyjne (do 1000 m² i 3 m głębokości — możliwe w trybie zgłoszenia wodnoprawnego). Zatrzyma ono wodę z nawalnych deszczów na miejscu zamiast odprowadzać ją poza pole.`,
            dataJustificationPl: `Analiza NMT (${elevation.source === 'gugik-nmt-1m' ? 'GUGiK 1 m' : 'DEM'}) wykazała różnicę wysokości ${elevation.reliefM} m (od ${elevation.maxM} do ${elevation.minM} m n.p.m., spadek śr. ${slope}%, ekspozycja ${elevation.aspectLabelPl}) oraz śr. ${meteo.historical10y.avgAnnualHeavyRainDays} dni/rok z opadem nawalnym ≥20 mm.`,
            expectedEffectPl: 'Zatrzymanie lokalnego spływu powierzchniowego, zasilenie wód podziemnych i rezerwa wody w okresach suchych.',
            horizonPl: 'wieloletnie',
            mapLocation: {
                lat: lp.lat,
                lng: lp.lng,
                labelPl: `Najniższy punkt działki (${lp.elevationM} m n.p.m.) — proponowana mikroretencja`,
            },
        });
    }
    // 3. Strefa buforowa przy istniejącym cieku / oczku / mokradle
    if (hydrology.nearestPondOrWetland && hydrology.nearestPondOrWetland.distanceM <= 600) {
        const p = hydrology.nearestPondOrWetland;
        retention.push({
            id: 'nwrm_wetland_buffer',
            stage: 'retencja_krajobrazowa',
            priority: 'sredni',
            titlePl: 'Ochrona pobliskiego oczka wodnego / mokradła i utworzenie pasa buforowego',
            descriptionPl: `Zachowaj lub załóż zadarniony pas buforowy (5–10 m) pomiędzy polem a istniejącym obiektem wodnym. Zapobiega to zamulaniu oczka spływającą glebą, chroni jego pojemność retencyjną oraz poprawia lokalny mikroklimat (wyższa wilgotność powietrza na działce).`,
            dataJustificationPl: `W odległości ok. ${p.distanceM} m od działki znajduje się ${p.labelPl.toLowerCase()}${p.name ? ` (${p.name})` : ''}.`,
            expectedEffectPl: 'Utrzymanie naturalnej retencji krajobrazowej i ograniczenie erozji wodnej.',
            horizonPl: 'ten_sezon',
            mapLocation: { lat: p.lat, lng: p.lng, labelPl: `${p.labelPl} (${p.distanceM} m)` },
        });
    }
    // 4. Zadrzewienia śródpolne / pasy wiatrochronne (gdy brak zadrzewień w 1 km i wysokie ET0 / wiatr / otwarty teren)
    if ((hydrology.osmAvailable && hydrology.shelterbeltsAndWoodsCount1000m <= 2) ||
        (meteo.available && meteo.current.et060dMm > 160 && highRisk)) {
        retention.push({
            id: 'nwrm_shelterbelt',
            stage: 'retencja_krajobrazowa',
            priority: hydrology.shelterbeltsAndWoodsCount1000m === 0 && highRisk ? 'wysoki' : 'sredni',
            titlePl: 'Zakładanie pasów wiatrochronnych (zadrzewień śródpolnych) na obrzeżach działki',
            descriptionPl: `Posadź pasy zakrzaczeń i zadrzewień rodzimych (np. lipa, klon, głóg, dzika róża) wzdłuż granicy działki prostopadle do dominujących wiatrów zachodnich. Pasy wiatrochronne zmniejszają prędkość wiatru przy gruncie, ograniczają parowanie potencjalne z łanu oraz zatrzymują zimą śnieg na polu.`,
            dataJustificationPl: `W promieniu 1 km wykryto jedynie ${hydrology.shelterbeltsAndWoodsCount1000m} pasów zadrzewień/lasów, przy rocznym opadzie ok. ${meteo.historical10y.avgAnnualPrecipMm} mm i 60-dniowym parowaniu ET₀ = ${meteo.current.et060dMm} mm.`,
            expectedEffectPl: 'Redukcja parowania terenowego o 15–25% w strefie osłony (do 15× wysokości drzew) oraz wyższa retencja śniegu.',
            horizonPl: 'wieloletnie',
        });
    }
    // === ETAP 3B: RETENCJA GLEBOWA (Próchnica, międzyplony, mulcz — wg Minasny et al. 2017 "4 per mille") ===
    const lowAwc = soil.available && (soil.iungCategory === 1 || soil.iungCategory === 2);
    const lowHumus = soil.available && soil.humusPct !== null && soil.humusPct < 2.5;
    retention.push({
        id: 'soil_organic_matter',
        stage: 'retencja_glebowa',
        priority: lowAwc || lowHumus || highRisk ? 'wysoki' : 'sredni',
        titlePl: 'Zwiększanie zawartości próchnicy (mulczowanie resztek pożniwnych i nawożenie organiczne)',
        descriptionPl: `Pozostawiaj na polu rozdrobnioną słomę i resztki pożniwne oraz regularnie wprowadzaj materię organiczną (obornik, kompost, poferment). Każdy wzrost zawartości próchnicy o 1 punkt procentowy zwiększa pojemność wodną gleby o ok. 15–20 mm (150–200 m³ wody na hektar), co bezpośrednio amortyzuje okresy bezopadowe.`,
        dataJustificationPl: soil.available
            ? `Dane ISRIC SoilGrids wskazują zawartość próchnicy ok. ${soil.humusPct ?? '—'}%, udział piasku ${soil.sandPct ?? '—'}% i retencję użyteczną AWC = ${soil.awc60cmMm ?? '—'} mm (0–60 cm, ${soil.iungCategoryLabelPl}).`
            : `Przy ${meteo.historical10y.droughtYearsCount}/10 sezonach z deficytem wody budowa materii organicznej jest najskuteczniejszym sposobem zwiększenia naturalnej retencji glebowej.`,
        expectedEffectPl: 'Wzrost retencji użytecznej gleby o +15–20 mm na każdy +1% próchnicy i ograniczenie parowania z powierzchni o 20–30%.',
        horizonPl: 'ten_sezon',
    });
    if (!crop.phenology.isPerennial) {
        retention.push({
            id: 'soil_cover_crops',
            stage: 'retencja_glebowa',
            priority: highRisk || lowAwc ? 'wysoki' : 'sredni',
            titlePl: `Wprowadzenie międzyplonów (okrywy roślinnej) dopasowanych do „${crop.namePl}”`,
            descriptionPl: `Po zbiorze plonu głównego wysiewaj międzyplony ścierniskowe lub ozime (${crop.recommendedCoverCropsPl.join(', ')}). System korzeniowy międzyplonów tworzy biopory zwiększające szybkość wsiąkania deszczu, a okrywa chroni glebę przed przegrzewaniem i erozją wietrzną. Uwaga: na glebach bardzo suchych wiosną międzyplon ozimy należy zakończyć odpowiednio wcześnie, aby nie zużył zapasu wody dla uprawy następczej.`,
            dataJustificationPl: `Historyczny deficyt na działce (${meteo.historical10y.droughtFrequencyPct}% lat z suszą, śr. opad roczny ${meteo.historical10y.avgAnnualPrecipMm} mm) oraz ${soil.available ? `przepuszczalność gleby kat. ${soil.iungCategory}` : 'warunki klimatyczne'} wymagają ochrony gleby przed pozostawianiem jej odkrytej.`,
            expectedEffectPl: 'Zwiększenie infiltracji wód opadowych o 25–40%, mniejsze zaskorupianie i dopływ świeżej materii organicznej.',
            horizonPl: 'ten_sezon',
        });
    }
    else {
        retention.push({
            id: 'soil_mulch_perennial',
            stage: 'retencja_glebowa',
            priority: highRisk ? 'wysoki' : 'sredni',
            titlePl: `Ściółkowanie i zadarnienie retencyjne w uprawie wieloletniej (${crop.namePl})`,
            descriptionPl: `Zastosuj zalecane praktyki okrywowe: ${crop.recommendedCoverCropsPl.join(' oraz ')}. Okrywa organiczna znacząco obniża temperaturę wierzchniej warstwy gleby (0–20 cm) i ogranicza bezproduktywne parowanie glebowe w miesiącach letnich.`,
            dataJustificationPl: `Uprawa wieloletnia o głębokości korzenienia Zr ≈ ${crop.rootDepthM} m; w analizowanym 10-leciu największe parowanie i deficyty występują ${meteo.historical10y.peakRiskPeriodPl}.`,
            expectedEffectPl: 'Ograniczenie parowania z gleby o 25–45% i stabilizacja wilgotności w strefie korzeniowej.',
            horizonPl: 'ten_sezon',
        });
    }
    // === ETAP 4: DZIAŁANIA AGROTECHNICZNE ===
    // 1. Uprawa poprzecznostokowa (TYLKO gdy NMT potwierdza wyraźny spadek!)
    if (elevation.available && (slope >= 2.0 || maxSlope >= 4.0)) {
        agrotech.push({
            id: 'agro_contour_tillage',
            stage: 'agrotechnika',
            priority: slope >= 4.0 ? 'wysoki' : 'sredni',
            titlePl: 'Uprawa poprzecznostokowa (wzdłuż warstwic) i spowalnianie spływu stokowego',
            descriptionPl: `Prowadź zabiegi uprawowe i siew w poprzek stoku (prostopadle do kierunku spływu wody), unikając bruzd i śladów przejazdowych biegnących z góry na dół. Na najstromszym odcinku warto wprowadzić poprzeczny pas trawiasty przechwytujący wodę z ulew.`,
            dataJustificationPl: `NMT wyznaczył spadek średni ${slope}% (lokalnie do ${maxSlope}%, różnica wysokości ${elevation.reliefM} m, spływ w kierunku: ${elevation.aspectLabelPl}).`,
            expectedEffectPl: 'Redukcja spływu powierzchniowego podczas ulew o 30–50% i ochrona warstwy próchnicznej przed zmywaniem.',
            horizonPl: 'natychmiast',
        });
    }
    // 2. Ograniczenie głębokiej orki / uprawa bezorkowa lub pasowa (strip-till)
    if (!crop.phenology.isPerennial && farmOptions.tillageType !== 'bezorkowy') {
        agrotech.push({
            id: 'agro_reduced_tillage',
            stage: 'agrotechnika',
            priority: lowAwc || highRisk ? 'wysoki' : 'sredni',
            titlePl: 'Ograniczenie głębokiej orki na rzecz uprawy uproszczonej / pasowej (strip-till)',
            descriptionPl: `Każde głębokie odwrócenie skiby pługiem przesusza warstwę orną (strata 15–25 mm wody w jednym zabiegu). Przejście na płytką uprawę bezorkową lub pasową (strip-till) z pozostawieniem mulczu na powierzchni zatrzymuje wilgoć w glebie, szczególnie przed siewami wiosennymi i sierpniowymi.`,
            dataJustificationPl: `W ostatnich 60 dniach KBW wyniósł ${meteo.current.kbw60dMm} mm przy stracie parowania ET₀ = ${meteo.current.et060dMm} mm${soil.available ? ` i pojemności wodnej gleby AWC = ${soil.awc60cmMm} mm (0–60 cm)` : ''}. ${farmOptions.tillageType === 'orkowy' ? 'Wskazano obecny system orkowy — zmiana przyniesie szczególnie wysoki zysk wilgoci.' : ''}`,
            expectedEffectPl: 'Oszczędność 15–30 mm wody w warstwie ornej w krytycznym okresie wschodów.',
            horizonPl: 'ten_sezon',
        });
    }
    // 3. Przerywanie parowania kapilarnego / zarządzanie ścierniskiem i terminem zabiegów
    agrotech.push({
        id: 'agro_evaporation_control',
        stage: 'agrotechnika',
        priority: assessment.currentRiskScore >= 45 ? 'wysoki' : 'uzupelniajacy',
        titlePl: 'Płytkie zerwanie ścierniska po zbiorze i ograniczanie zbędnych przejazdów',
        descriptionPl: `Bezpośrednio po żniwach wykonaj bardzo płytką uprawę pożniwną (3–5 cm, np. broną talerzową lub chwastownikiem) z dociśnięciem wałem, aby przerwać podsiąk kapilarny i zatrzymać resztkową wilgoć w glebie. Ogranicz liczbę przejazdów ciężkim sprzętem, by zapobiec powstawaniu podeszwy płużnej blokującej wsiąkanie wody i rozwój głębokich korzeni.`,
        dataJustificationPl: `W ciągu ostatnich 30 dni temperatura maksymalna osiągała ${meteo.current.tempMax30d}°C, a najdłuższy ciąg dni bez opadu trwał ${meteo.current.longestDrySpell60d} dni.`,
        expectedEffectPl: 'Ograniczenie nieproduktywnego parowania glebowego oraz lepsze ukorzenienie kolejnych upraw.',
        horizonPl: 'natychmiast',
    });
    // 4. Dobór odmian i struktury zasiewów przy wysokiej podatności 10-letniej
    if (assessment.historicalRiskScore >= 45 || soil.iungCategory === 1 || crop.droughtSensitivity >= 4) {
        agrotech.push({
            id: 'agro_crop_adaptation',
            stage: 'agrotechnika',
            priority: assessment.historicalRiskScore >= 60 ? 'wysoki' : 'sredni',
            titlePl: `Dostosowanie odmian i struktury zasiewów do 10-letniego ryzyka suszy (${crop.namePl})`,
            descriptionPl: `Ze względu na powtarzające się niedobory wody na tej działce rozważ: ${crop.droughtAlternativesPl} W planowaniu płodozmianu unikaj następstwa roślin silnie wyczerpujących wodę z głębszych warstw gleby bez międzyplonu lub regeneracji zimowej.`,
            dataJustificationPl: `W 10-letniej analizie (${meteo.historyStart.slice(0, 4)}–${meteo.historyEnd.slice(0, 4)}) próg suszy IUNG był przekraczany w ${meteo.historical10y.droughtYearsCount} sezonach (${meteo.historical10y.droughtFrequencyPct}%), z najsilniejszym deficytem ${meteo.historical10y.peakRiskPeriodPl}. Uprawa „${crop.namePl}” ma wrażliwość ${crop.droughtSensitivity}/5.`,
            expectedEffectPl: 'Zmniejszenie ryzyka strat plonu o 15–30% w latach suchych i lepsze wykorzystanie wody pozimowej.',
            horizonPl: 'wieloletnie',
        });
    }
    return { retention, agrotech };
};
exports.buildRecommendations = buildRecommendations;
/**
 * ETAP 5: Rekomendacje dotyczące nawadniania (OPCJONALNE — wyłącznie po ocenie sytuacji wodnej i retencji!)
 * Wylicza orientacyjną dawkę polewową wg FAO-56 (uzupełnienie niedoboru RAW bez strat przesiąkowych)
 * z uwzględnieniem 7-dniowej prognozy opadów dla analiz bieżących.
 */
const buildIrrigationAdvice = (ctx) => {
    const { parcel, crop, meteo, soil, hydrology, assessment, farmOptions } = ctx;
    const priorityNotePl = 'Zgodnie z wytycznymi naukowymi (FAO, NWRM UE) oraz metodyką KOWR priorytetem są działania zwiększające retencję glebową i krajobrazową; nawadnianie należy traktować wyłącznie jako uzupełnienie w sytuacjach krytycznego niedoboru.';
    const legalNotePl = 'Pobór wód powierzchniowych lub podziemnych do nawadniania rolniczego (>5 m³/dobę średniorocznie) wymaga uzyskania pozwolenia wodnoprawnego (PGW Wody Polskie) zgodnie z ustawą Prawo wodne.' +
        (hydrology.nearestWatercourse
            ? ` Najbliższy zinwentaryzowany ciek znajduje się ok. ${hydrology.nearestWatercourse.distanceM} m od działki.`
            : '');
    // Poza sezonem wegetacyjnym -> nawadnianie bezzasadne
    if (meteo.available && !meteo.current.isGrowingSeason) {
        return {
            decision: 'niezalecane',
            decisionLabelPl: 'Nawadnianie niezalecane (poza okresem wegetacji)',
            headlinePl: `W dniu ${meteo.analysisDate} uprawa „${crop.namePl}” znajduje się w fazie „${meteo.current.phenologyStagePl}” — zabiegi nawadniania nie są zasadne.`,
            rationalePl: 'Zamiast nawadniania skup się na zatrzymaniu wody z opadów jesienno-zimowych w glebie (mulcz, międzyplony, drożna struktura gleby oraz spowolnienie odpływu w rowach).',
            recommendedDoseMm: null,
            recommendedVolumeM3PerHa: null,
            totalParcelVolumeM3: null,
            timingWindowPl: 'Nie dotyczy (okres spoczynku / poza wegetacją).',
            forecastConsiderationPl: meteo.forecast7d.available
                ? `Prognoza 7-dniowa: opad ${meteo.forecast7d.totalPrecipMm} mm, parowanie ET₀ ${meteo.forecast7d.totalEt0Mm} mm.`
                : meteo.forecast7d.note ?? 'Brak prognozy (data historyczna).',
            priorityNotePl,
            legalNotePl,
        };
    }
    // Niskie ryzyko bieżące -> brak potrzeby nawadniania
    if (assessment.currentRiskScore < 42) {
        return {
            decision: 'niezalecane',
            decisionLabelPl: 'Nawadnianie zbędne w tym terminie',
            headlinePl: `Bieżący bilans wodny (${meteo.current.kbw60dMm} mm/60d) pokrywa aktualne potrzeby uprawy „${crop.namePl}”.`,
            rationalePl: 'Zapas wilgoci w strefie korzeniowej jest wystarczający. Nawadnianie w obecnych warunkach byłoby nieekonomiczne i mogłoby spowodować wymywanie składników pokarmowych (azotu) poniżej strefy korzeniowej.',
            recommendedDoseMm: null,
            recommendedVolumeM3PerHa: null,
            totalParcelVolumeM3: null,
            timingWindowPl: `Ponowna kontrola za 7–10 dni${meteo.historical10y.peakRiskMonths.length ? ` (szczególnie uważnie ${meteo.historical10y.peakRiskPeriodPl})` : ''}.`,
            forecastConsiderationPl: meteo.forecast7d.available
                ? `W ciągu najbliższych 7 dni prognozowane jest ${meteo.forecast7d.totalPrecipMm} mm opadów wobec ${meteo.forecast7d.totalEt0Mm} mm parowania ET₀.`
                : meteo.forecast7d.note ?? 'Analiza dla daty historycznej — brak prognozy krótkoterminowej.',
            priorityNotePl,
            legalNotePl,
        };
    }
    // Jeśli data bieżąca i w prognozie 48h idzie istotny opad (>= 12 mm) -> WSTRZYMAJ!
    if (meteo.forecast7d.available && meteo.forecast7d.precipNext48hMm >= 12) {
        return {
            decision: 'wstrzymaj_opad',
            decisionLabelPl: 'Wstrzymaj nawadnianie — prognozowany opad',
            headlinePl: `Mimo podwyższonego deficytu (KBW: ${meteo.current.kbw60dMm} mm) w ciągu 48 godzin prognozowany jest opad ${meteo.forecast7d.precipNext48hMm} mm.`,
            rationalePl: 'Wstrzymanie nawadniania przed nadchodzącym deszczem pozwala zaoszczędzić energię i wodę oraz uniknąć spływu powierzchniowego z przesyconej wierzchniej warstwy gleby. Oceń wilgotność ponownie 24 godziny po opadzie.',
            recommendedDoseMm: null,
            recommendedVolumeM3PerHa: null,
            totalParcelVolumeM3: null,
            timingWindowPl: 'Odroczenie o 48–72 godziny i ponowna weryfikacja po przejściu opadów.',
            forecastConsiderationPl: `Prognoza: ${meteo.forecast7d.precipNext48hMm} mm w ciągu 48h (łącznie ${meteo.forecast7d.totalPrecipMm} mm w 7 dni wobec ET₀ = ${meteo.forecast7d.totalEt0Mm} mm).`,
            priorityNotePl,
            legalNotePl,
        };
    }
    // Wyliczenie orientacyjnej bezpiecznej dawki polewowej FAO-56 (nieprzekraczającej 80% RAW oraz bezpiecznej dla gleby)
    const rawMm = soil.rawRootZoneMm ?? Math.round(125 * crop.rootDepthM * crop.depletionFractionP);
    const net30dDeficit = Math.max(10, -meteo.current.cropBalance30dMm);
    const maxSingleDose = soil.iungCategory === 1 ? 22 : soil.iungCategory === 2 ? 28 : 35;
    const forecastRelief = meteo.forecast7d.available ? meteo.forecast7d.totalPrecipMm * 0.65 : 0;
    const computedDose = Math.round(clamp(Math.min(rawMm * 0.7, net30dDeficit * 0.45) - forecastRelief, 12, maxSingleDose));
    // Podwyższone ryzyko (42–64) -> Monitoruj / rozważ jeśli wysoka wrażliwość lub system już istnieje
    if (assessment.currentRiskScore < 65 && !(crop.droughtSensitivity >= 4 && assessment.currentRiskScore >= 52)) {
        return {
            decision: 'monitoruj',
            decisionLabelPl: 'Monitoruj wilgotność — nawadnianie warunkowe',
            headlinePl: `Występuje podwyższony niedobór wody (KBW 60d: ${meteo.current.kbw60dMm} mm), ale nie osiągnął jeszcze poziomu krytycznego dla „${crop.namePl}”.`,
            rationalePl: `${farmOptions.hasIrrigationSystem
                ? 'Ponieważ gospodarstwo posiada infrastrukturę nawadniającą, warto przygotować system do uruchomienia, jeśli w ciągu najbliższych 5–7 dni nie wystąpi opad >10 mm.'
                : 'Na tym etapie inwestycja w doraźne nawadnianie może nie być uzasadniona ekonomicznie — sprawdź wilgotność gleby na głębokości 15–20 cm metodą dotykową (test wałeczka) oraz skup się na działaniach ograniczających parowanie.'}`,
            recommendedDoseMm: computedDose,
            recommendedVolumeM3PerHa: computedDose * 10,
            totalParcelVolumeM3: Math.round(computedDose * 10 * parcel.areaHa),
            timingWindowPl: 'W przypadku utrzymania się suszy przez kolejne 5–7 dni: wczesny ranek (4:00–8:00) lub późny wieczór (po 20:00).',
            forecastConsiderationPl: meteo.forecast7d.available
                ? `Prognoza 7-dniowa przewiduje ${meteo.forecast7d.totalPrecipMm} mm opadów przy parowaniu ET₀ = ${meteo.forecast7d.totalEt0Mm} mm (bilans tygodnia: ${round(meteo.forecast7d.totalPrecipMm - meteo.forecast7d.totalEt0Mm, 1)} mm).`
                : meteo.forecast7d.note ?? 'Data historyczna — ocena oparta na bieżącym bilansie 30- i 60-dniowym.',
            priorityNotePl,
            legalNotePl,
        };
    }
    // Wysokie / krytyczne ryzyko w sezonie wegetacyjnym -> Nawadnianie uzupełniające zasadne!
    return {
        decision: 'zalecane',
        decisionLabelPl: 'Zasadne nawadnianie uzupełniające',
        headlinePl: `Wykazano istotny deficyt wody dla „${crop.namePl}” (${assessment.currentRiskLabelPl.toLowerCase()}, KBW 60d: ${meteo.current.kbw60dMm} mm) — nawadnianie może znacząco ograniczyć straty plonu.`,
        rationalePl: `Bilans wodny uprawy z ostatnich 30 dni wynosi ${meteo.current.cropBalance30dMm} mm (ciąg bezopadowy: ${meteo.current.consecutiveDryDays} dni), a faza „${meteo.current.phenologyStagePl}” cechuje się współczynnikiem Kc = ${meteo.current.kcCurrent}. Jednorazowa dawka nie powinna przekraczać ${maxSingleDose} mm, aby uniknąć przesiąkania poza strefę korzeniową (${crop.rootDepthM} m)${soil.iungCategory && soil.iungCategory <= 2 ? ' na lekkiej glebie' : ''}.`,
        recommendedDoseMm: computedDose,
        recommendedVolumeM3PerHa: computedDose * 10,
        totalParcelVolumeM3: Math.round(computedDose * 10 * parcel.areaHa),
        timingWindowPl: `Najbliższe 1–3 dni, wyłącznie w godzinach porannych (4:00–8:00) lub nocnych (21:00–4:00) przy niskim wietrze (redukcja strat parowania z deszczowni nawet o 30%).${crop.droughtSensitivity === 5 ? ' Dla upraw rzędowych/ogrodniczych preferowane nawadnianie kropelkowe.' : ''}`,
        forecastConsiderationPl: meteo.forecast7d.available
            ? `Prognoza 7-dniowa nie przynosi wystarczającej ulgi: opad ${meteo.forecast7d.totalPrecipMm} mm wobec ET₀ = ${meteo.forecast7d.totalEt0Mm} mm (dawka skorygowana o prognozowane opady).`
            : meteo.forecast7d.note ?? 'Analiza historyczna — dawka wyliczona z historycznego bilansu wodnego i pojemności wodnej gleby.',
        priorityNotePl,
        legalNotePl,
    };
};
exports.buildIrrigationAdvice = buildIrrigationAdvice;
/**
 * ETAP 6: Dokumentacja źródeł danych, wskaźnik pewności / niepewności i ograniczenia raportu (Wymóg KOWR §3.3 pkt 5!)
 */
const buildProvenanceAndLimitations = (ctx) => {
    const { parcel, elevation, meteo, satellite, soil, hydrology } = ctx;
    const provenance = [
        {
            id: 'uldk_egib',
            name: parcel.source === 'kieg+uldk' ? 'GUGiK KIEG WMS + ULDK (EGiB)' : 'GUGiK ULDK (Ewidencja Gruntów i Budynków)',
            category: 'przestrzenne',
            status: parcel.isApproximateBuffer ? 'partial' : 'live',
            statusLabelPl: parcel.isApproximateBuffer ? 'Przybliżony bufor (brak granic EGiB)' : 'Pobrano na żywo',
            fetchedAt: parcel.fetchedAt,
            dataRange: 'Aktualny stan EGiB',
            spatialResolution: parcel.isApproximateBuffer ? 'Bufor ~160×160 m' : 'Granice ewidencyjne działki (dokładność katastralna)',
            license: 'Dane publiczne GUGiK (ustawa Prawo geodezyjne i kartograficzne — bezpłatne, otwarte)',
            url: 'https://uldk.gugik.gov.pl/',
            notePl: parcel.isApproximateBuffer ? 'Nie udało się pobrać geometrii działki z ULDK — zastosowano standardowy obszar analizy wokół punktu.' : undefined,
        },
        {
            id: 'nmt_dem',
            name: elevation.source === 'gugik-nmt-1m' ? 'GUGiK NMT (Numeryczny Model Terenu)' : 'Open-Meteo Elevation (Copernicus DEM)',
            category: 'przestrzenne',
            status: !elevation.available ? 'unavailable' : elevation.source === 'gugik-nmt-1m' ? 'live' : 'partial',
            statusLabelPl: !elevation.available ? 'Niedostępne' : elevation.source === 'gugik-nmt-1m' ? 'Pobrano na żywo (1 m)' : 'Zapasowy DEM (~30 m)',
            fetchedAt: elevation.fetchedAt,
            dataRange: 'Aktualny NMT',
            spatialResolution: elevation.resolutionM ? `${elevation.resolutionM} m (${elevation.sampleCount} pkt na działce)` : 'Brak',
            license: elevation.source === 'gugik-nmt-1m' ? 'Dane publiczne GUGiK (otwarte)' : 'Copernicus DEM / Open-Meteo (CC-BY 4.0)',
            url: elevation.source === 'gugik-nmt-1m' ? 'https://www.geoportal.gov.pl/' : 'https://open-meteo.com/en/docs/elevation-api',
            notePl: elevation.note,
        },
        {
            id: 'meteo_10y',
            name: 'NASA POWER Agroclimatology + Open-Meteo' + (meteo.imgwSynop ? ' + IMGW-PIB Synop' : ''),
            category: 'meteorologiczne',
            status: meteo.available ? 'live' : 'unavailable',
            statusLabelPl: meteo.available ? `Pobrano (${meteo.yearsAnalyzed} lat historii)` : 'Niedostępne',
            fetchedAt: meteo.fetchedAt,
            dataRange: meteo.available ? `${meteo.historyStart} – ${meteo.historyEnd}` : 'Brak',
            spatialResolution: 'NASA POWER ~0.5° (~50 km), Open-Meteo ~9 km, IMGW stacja punktowa',
            license: 'NASA POWER (Public Domain), Open-Meteo (CC-BY 4.0), IMGW-PIB (Dane Publiczne)',
            url: 'https://power.larc.nasa.gov/',
            notePl: meteo.sources.join('; '),
        },
        {
            id: 'sentinel2',
            name: 'Copernicus Sentinel-2 L2A (AWS Earth Search STAC)',
            category: 'satelitarne',
            status: satellite.available ? 'live' : 'unavailable',
            statusLabelPl: satellite.available ? `Pobrano (scena ${satellite.sceneDate})` : 'Brak bezchmurnej sceny',
            fetchedAt: satellite.fetchedAt,
            dataRange: satellite.sceneDate
                ? `Scena z ${satellite.sceneDate} (${satellite.daysBeforeAnalysis} dni przed datą analizy)`
                : `Okno 60 dni przed ${meteo.analysisDate}`,
            spatialResolution: '10 m (NDVI: B04/B08) / 20 m (NDMI: B11, maska chmur SCL)',
            license: 'Copernicus Sentinel Data (Free, Full and Open Data Policy)',
            url: 'https://earth-search.aws.element84.com/v1',
            notePl: satellite.unavailableReason,
        },
        {
            id: 'soilgrids',
            name: soil.source === 'user-override' ? 'Kategoria gleby wskazana przez rolnika (SoilGrids niedostępny)' : 'ISRIC SoilGrids v2.0 + Saxton & Rawls (2006)',
            category: 'glebowe',
            status: !soil.available ? 'unavailable' : soil.source === 'user-override' ? 'partial' : 'live',
            statusLabelPl: !soil.available ? 'Niedostępne' : soil.isUserOverridden ? 'Kategoria z korektą rolnika' : 'Pobrano na żywo',
            fetchedAt: soil.fetchedAt,
            dataRange: 'Profil 0–60 cm (4 warstwy głębokości)',
            spatialResolution: '250 m (model globalny map glebowych)',
            license: 'CC-BY 4.0 (ISRIC — World Soil Information)',
            url: 'https://soilgrids.org/',
            notePl: soil.note,
        },
        {
            id: 'hydrology',
            name: 'IMGW-PIB Hydro + OpenStreetMap Overpass (hydrografia i krajobraz)',
            category: 'hydrologiczne',
            status: hydrology.osmAvailable && hydrology.imgwAvailable
                ? 'live'
                : hydrology.osmAvailable || hydrology.imgwAvailable
                    ? 'partial'
                    : 'unavailable',
            statusLabelPl: hydrology.osmAvailable && hydrology.imgwAvailable
                ? 'Pobrano na żywo'
                : hydrology.osmAvailable || hydrology.imgwAvailable
                    ? 'Częściowe dane'
                    : 'Niedostępne',
            fetchedAt: hydrology.fetchedAt,
            dataRange: hydrology.imgwApplicableToDate ? 'Bieżące stany wód IMGW + aktualna sieć OSM' : 'Sieć cieków/rowów OSM (IMGW bieżące nie dotyczy daty historycznej)',
            spatialResolution: 'Wektorowe obiekty OSM (promień 1,5 km) + najbliższe wodowskazy IMGW',
            license: 'IMGW-PIB Dane Publiczne; OpenStreetMap (ODbL)',
            url: 'https://danepubliczne.imgw.pl/',
            notePl: hydrology.note,
        },
    ];
    // Dynamiczne obliczanie pewności i jawne raportowanie wszystkich braków danych!
    let confidence = 95;
    const missingDataPl = [];
    const uncertaintyReasonsPl = [];
    if (!meteo.available) {
        confidence -= 45;
        missingDataPl.push('Brak danych meteorologicznych (NASA POWER / Open-Meteo) — kluczowy składnik bilansu wodnego jest niedostępny.');
    }
    else {
        uncertaintyReasonsPl.push('Dane meteorologiczne opierają się na siatce satelitarno-reanalizowej (~9–50 km), która może nie wychwycić punktowych letnich opadów burzowych nad pojedynczą działką.');
    }
    if (!soil.available) {
        confidence -= 18;
        missingDataPl.push('Brak danych glebowych ISRIC SoilGrids dla tej lokalizacji — przyjęto ostrożnościową kategorię gleby II dla progów IUNG (możesz ją doprecyzować ręcznie).');
    }
    else {
        uncertaintyReasonsPl.push('ISRIC SoilGrids ma rozdzielczość 250 m i nie zastępuje lokalnej odkrywki glebowej ani laboratoryjnej analizy zawartości próchnicy i pH.');
    }
    if (!satellite.available) {
        confidence -= 14;
        missingDataPl.push(`Brak bezchmurnego zobrazowania satelitarnego Sentinel-2 L2A (${satellite.unavailableReason ?? 'zachmurzenie lub brak scen w oknie 60 dni'}).`);
    }
    else {
        if ((satellite.daysBeforeAnalysis ?? 0) > 20) {
            confidence -= 6;
            uncertaintyReasonsPl.push(`Ostatnia bezchmurna scena satelitarna Sentinel-2 pochodzi sprzed ${satellite.daysBeforeAnalysis} dni (${satellite.sceneDate}) — stan łanu mógł się od tego czasu zmienić.`);
        }
        if ((satellite.validPixelsPct ?? 100) < 70) {
            confidence -= 5;
            uncertaintyReasonsPl.push(`Część pikseli działki była przysłonięta chmurami/cieniem (ważne piksele: ${satellite.validPixelsPct}%).`);
        }
    }
    if (!elevation.available) {
        confidence -= 10;
        missingDataPl.push('Brak danych wysokościowych NMT — nie wyznaczono dokładnego spadku ani punktu mikroretencji.');
    }
    else if (elevation.source !== 'gugik-nmt-1m') {
        confidence -= 4;
        uncertaintyReasonsPl.push('Użyto globalnego modelu wysokościowego ~30 m zamiast polskiego NMT 1 m (mniejsza precyzja mikrozagłębień).');
    }
    if (!hydrology.osmAvailable) {
        confidence -= 6;
        missingDataPl.push('Brak wektorowych danych o rowach melioracyjnych, oczkach wodnych i zadrzewieniach z OpenStreetMap (przeciążenie serwera Overpass).');
    }
    if (parcel.isApproximateBuffer) {
        confidence -= 6;
        missingDataPl.push('Nie pobrano dokładnego obrysu katastralnego działki z ULDK — analizę wykonano dla przybliżonego bufora wokół wskazanego punktu.');
    }
    if (meteo.isHistoricalDate) {
        uncertaintyReasonsPl.push('Analiza dotyczy daty historycznej — krótkoterminowa prognoza pogody oraz bieżące stany wodowskazów IMGW-PIB nie mają zastosowania do tej daty.');
    }
    confidence = clamp(Math.round(confidence), 20, 96);
    const confidenceLevel = confidence >= 75 ? 'wysoka' : confidence >= 55 ? 'srednia' : 'obnizona';
    const confidenceLabelPl = confidenceLevel === 'wysoka'
        ? `Wysoka pewność analizy (${confidence}%)`
        : confidenceLevel === 'srednia'
            ? `Średnia pewność analizy (${confidence}%)`
            : `Obniżona pewność — niepełne dane (${confidence}%)`;
    const unmodeledFactorsPl = [
        'Stan techniczny podziemnej sieci drenarskiej (sączków) oraz drożność lokalnych rowów i przepustów w terenie.',
        'Lokalny poziom wód gruntowych na głębokości > 1 m (np. lokalne podsiąkanie w dolinach rzecznych lub odwodnienie górnicze).',
        'Rzeczywista data siewu, obsada roślin, konkretna odmiana oraz wykonane już na działce zabiegi uprawowe i nawożenie.',
        'Lokalne mikrozjawiska pogodowe (punktowe burze konwekcyjne, lokalne gradobicia) poniżej rozdzielczości siatki meteorologicznej.',
        'Formalny status prawny rowów i cieków (własność, spółki wodne, konieczność zgłoszeń lub pozwoleń wodnoprawnych).',
    ];
    const scientificBasisPl = [
        'Allen, R. G., Pereira, L. S., & Smith, M. (2025). Crop evapotranspiration: Guidelines for computing crop water requirements (FAO Irrigation and Drainage Paper No. 56, Rev. 1). FAO.',
        'Doroszewski, A., Kozyra, J., et al. (2012). Podstawy Systemu Monitoringu Suszy Rolniczej. IUNG-PIB Puławy.',
        'European Commission (2014, 2015). Natural Water Retention Measures (NWRM) — Policy Document & Implementation Guide.',
        'Minasny, B., et al. (2017). Soil carbon 4 per mille. Geoderma, 292, 59–86.',
        'Saxton, K. E., & Rawls, W. J. (2006). Soil Water Characteristic Estimates by Texture and Organic Matter for Hydrologic Solutions. Soil Science Society of America Journal, 70(5), 1569–1578.',
        'Żyłowska, K., & Kozyra, J. (2025). Zintegrowane monitorowanie suszy na potrzeby rolnictwa – przegląd systemów i wskaźników. IUNG-PIB.',
    ];
    return {
        provenance,
        limitations: {
            confidencePct: confidence,
            confidenceLevel,
            confidenceLabelPl,
            missingDataPl,
            uncertaintyReasonsPl,
            unmodeledFactorsPl,
            scientificBasisPl,
        },
    };
};
exports.buildProvenanceAndLimitations = buildProvenanceAndLimitations;
