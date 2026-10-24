# Australische alarmering: hoe het werkt, wat mag, en wat we ermee doen

Onderzocht op 24 oktober 2026, in vier deelonderzoeken plus eigen controles. Het bouwt voort op [het marktonderzoek van 11 september](MARKTONDERZOEK-AU-2026-09-11.md) en [CFSScan en meer meldingen](CFSSCAN-EN-MEER-MELDINGEN-2026-09-11.md).

**Afspraken in dit document:**
- Bronnen staan bij de feiten.
- Onzekere punten zijn gemarkeerd met ⚠.
- Tellingen van feeds en apps zijn momentopnamen van 24 oktober rond 00:30–01:00 AEDT, in de nacht van zaterdag op zondag. De incidentaantallen zijn daardoor laag.
- Het zoekbudget van de sessie raakte op. Een deel van de officiële .gov.au-pagina's is daarom alleen via zoekuittreksels of Wayback gelezen.

Dit is onderzoek, geen juridisch advies.

## Samenvatting

- **Er is geen Australische P2000.** Hulpdiensten zijn een zaak van de staten. Elke staat heeft een eigen pagernetwerk, vooral om vrijwilligers op te roepen.
  - Victoria: POCSAG.
  - Zuid-Australië: FLEX 1600, dezelfde familie als P2000.
  - NSW: POCSAG.
  - Tasmanië: POCSAG.
  - Queensland en West-Australië: grotendeels app en sms.
  
  De politie zit niet op deze netwerken.
- **Er zijn capcodes**, met 7 cijfers per brigade, groep en rol, maar er is geen openbare capcodelijst. De netwerken van VIC, SA en NSW zijn onversleuteld, en hobbyisten en commerciële apps decoderen ze (Mazzanet, CFSScan, SApaging, RFSPager, VicPagers).
- **Juridisch is pagerdata een grijs gebied met echte risico's.**
  - Of decoderen "interceptie" is onder de TIA Act, heeft nog geen rechter beslist. Publiceren is dan een apart delict.
  - Instanties treden op: in TAS (2021) en WA (2020) zijn sites met ambulanceberichten offline gehaald.
  - Sinds juni 2025 bestaat een wettelijke privacy-tort.
  - Er is geen Nederlandse gedoogcultuur.
- **Feeds met een licentie die commercieel gebruik toestaat:**
  - In orde: ACT (zelf nagekeken), NSW RFS, QLD en DEA Hotspots.
  - Te bevestigen: VIC en SA, voordat de betaalde versie erop leunt.
  - Niet zonder afspraak: NT, BOM en TAS.
- **Gaten in de markt:**
  - één rustige, landelijke app over de staatsgrenzen heen (Emergency AUS lijkt verdwenen; QLD heeft geen eigen app);
  - beter meldingsbeheer, want spam en gemiste meldingen zijn de grootste klachten over de officiële apps.
  
  Mensen betalen wel: de "VIC/QLD/SA Fires"-apps (A$1,99) staan bovenaan in de betaalde Nieuws-apps.

## 1. Opbouw van het systeem

**Federaal tegenover de staten.** Brandweer, SES, ambulance en politie zijn grondwettelijk een zaak van de zes staten en twee territoria. Federaal zijn er ondersteunende spelers:
- het weerbureau BOM, dat ook gastheer is van de CAP-AU-standaard;
- NEMA, sinds 1 september 2022 ([Wikipedia](https://en.wikipedia.org/wiki/National_Emergency_Management_Agency_(Australia))), dat AusAlert beheert;
- AFAC, de koepel van brandweer en hulpdiensten ([AFAC](https://www.afac.com.au/about)), die de landelijke waarschuwingsniveaus en de brandgevaarschaal heeft ontwikkeld;
- de ABC als officiële noodomroep, op basis van afspraken met de staten ([AIDR](https://knowledge.aidr.org.au/media/10573/aidr_warnings-republishers_companion.pdf)).

**Per staat, in het kort:**
- **VIC:**
  - Fire Rescue Victoria, beroeps, sinds juli 2020;
  - CFA, vrijwilligers, ruim 1.200 brigades;
  - VICSES, Ambulance Victoria, Victoria Police.
- **NSW:** FRNSW (stad), RFS (vrijwilligers, ±95% van het land), NSW SES, NSW Ambulance.
- **QLD:** QFES is in 2024 opgesplitst ([MRQ](https://www.mrq.qld.gov.au/news/new-era-state-emergency-and-marine-rescue-services)):
  - Queensland Fire Department, sinds 1 juli 2024;
  - SES en Marine Rescue vallen onder de politie.
- **SA:** CFS, MFS en SES onder SAFECOM, plus SA Ambulance Service.
- **WA:** DFES. De ambulance is St John, op contract.
- **TAS:** TFS, SES en Ambulance Tasmania. Een fusie is in voorbereiding.
- **NT:** NTPFES voor politie, brandweer en noodhulp. De ambulance is St John.
- **ACT:** ESA voor brandweer, RFS, SES en ambulance. De politie is de federale AFP.

**Hoe een 000-melding loopt:**
1. Je belt 000; op mobiel werkt 112 ook. Telstra neemt op in Melbourne, Sydney of Adelaide: "Emergency. Police, Fire or Ambulance?" Dat gebeurt ±11,7 miljoen keer per jaar ([Telstra](https://www.telstra.com.au/exchange/how-triple-zero-works--the-ecosystem-behind-a-call-for-help--)).
2. De telefonist verbindt warm door: hij blijft aan de lijn tot de meldkamer van de staat opneemt. Een smartphone stuurt de locatie mee (AML).
3. De meldkamer zet het incident in het meldkamersysteem (CAD) en alarmeert: beroepskorpsen via radio en data, vrijwilligers via pager, app of sms.
4. **Victoria is de uitzondering:** Triple Zero Victoria, het vroegere ESTA, doet de meldkamer voor álle diensten. Dat waren 3,09 miljoen oproepen in 2024-25 ([TZV](https://www.triplezero.vic.gov.au/about-us)). In de andere staten heeft elke dienst een eigen meldkamer.

Het meldkamersysteem is ook de bron van de beste openbare feeds:
- Victoria publiceert brandweerinzetten rechtstreeks uit de meldkamer, met het label "VIC/ESTA".
- ACT ververst elke 60 seconden uit zijn CAD.

## 2. Geschiedenis

- **000 sinds 1961**, ingevoerd door de toenmalige PTT, eerst in de grote steden ([Wikipedia](https://en.wikipedia.org/wiki/000_(emergency_telephone_number))). Waarom 000:
  - in afgelegen Queensland was de 0 al de toegang tot de interlokale lijn;
  - op de draaischijf zit de 0 naast de vingerstop, dus je vindt hem ook in het donker of in rook.
  
  ⚠ Geen primaire bron gevonden voor deze verklaring.
- **Vrijwilligers oproepen** ging van brandklok naar kazernesirene, en daarna naar pagers ([Museum of Fire](https://www.museumoffire.net/single-post/a-brief-history-of-the-station-siren)).
  - NSW: sinds 1970 konden sommige sirenes op afstand worden aangezet door de 000-centrale; pagers vanaf 1983, breed in gebruik in de jaren 90.
  - Victoria: de staat leunde op Telstra-paging en telefoonketens, tot Telstra stopte en de CFA-dekking onder de 50% zakte (minister, 21 mei 2004, [PAEC](https://parliament.vic.gov.au/49283c/globalassets/sections-shared/get-involved/historical-inquiries/inquiry-into-budget-estimates-2004-2005/paec-transcript_budgetestimates2004-policeemergencyservices_2004-05-21.pdf)). Toen bouwde Victoria vanaf 2005 de EAS. In sommige dorpen loeit de sirene nog ([ABC, Bethanga](https://www.abc.net.au/news/2025-01-02/siren-still-used-to-call-in-volunteer-firefighters-in-bethanga/104581710)).
- **Rampen die het systeem vormden:**
  - **1939, Black Friday** (71 doden): CFA Act 1944, de CFA begon in 1945.
  - **1983, Ash Wednesday** (75 doden): de communicatie bleek ontoereikend.
  - **2009, Black Saturday** (173 doden): Royal Commission.
    - Emergency Alert: sms en telefoon per gebied, vanaf december 2009 ([NSW](https://arp.nsw.gov.au/c2010-07-implementation-nsw-emergency-alert-national-telephone-emergency-warning-system)).
    - De hoogste brandgevaarstand "Catastrophic", in Victoria "Code Red".
    - De eerste overheidsapps (2010).
  - **2019-20, Black Summer:** Royal Commission met 80 aanbevelingen (2020). Hoofdstuk 13 gaat over waarschuwen ([QLD-voortgangsrapport](https://www.disaster.qld.gov.au/__data/assets/pdf_file/0018/337212/Royal-Commission-into-National-Natural-Disaster-Arrangements-Progress-Report-October-2021.pdf)):
    - één brandgevaarschaal;
    - één waarschuwingssysteem;
    - minimumeisen voor brand-apps;
    - onderzoek naar een landelijke waarschuwingsapp.
- **Recent:**
  - **Optus, november 2023:** 2.145 mensen kregen 000 niet te pakken ([ACMA](https://www.acma.gov.au/articles/2024-11/optus-pays-12-million-penalty-triple-zero-outage)).
  - **3G uit, oktober 2024:** toestellen die 000 niet via 4G kunnen bellen, worden geblokkeerd ([Infrastructure](https://www.infrastructure.gov.au/media-communications/phone/mobile-services-and-coverage/3g-network-switch)).
  - **Optus, 18 september 2025:** ±14 uur geen 000 in WA, SA, NT en een deel van NSW, met doden gekoppeld; ⚠ het aantal is verschillend gerapporteerd ([ABC](https://www.abc.net.au/news/2025-09-23/timeline-on-optus-triple-0-outage-what-we-know/105805890)).
  - **Triple Zero Custodian:** de wet ging op 29 oktober 2025 door en geldt sinds 31 oktober 2025. Boetes tot $30 miljoen, storingen realtime melden, 000 testen bij netwerkwijzigingen ([CriticalComms](https://www.criticalcomms.com.au/content/public-safety/article/triple-zero-custodian-bill-passes-as-senate-inquiry-looms-819771328)).

## 3. Waarschuwen vandaag

- **Australian Warning System** ([AIDR](https://knowledge.aidr.org.au/media/9105/aidr_australian-warning-system_companion_2021.pdf)):
  - drie niveaus: Advice (geel), Watch and Act (oranje) en Emergency Warning (rood);
  - driehoekige iconen per gevaar;
  - vaste actiezinnen: "Prepare now", "Leave now", "Shelter indoors now" en dergelijke;
  - invoering: bosbranden in ACT, VIC en QLD vanaf ±december 2020, NSW SES vanaf september 2022, QLD voor alle gevaren vanaf november 2023, WA volledig vanaf juli 2024. ⚠ SA, NT en TAS niet nagekeken.
- **Australian Fire Danger Rating System**, sinds 1 september 2022: Moderate, High, Extreme en Catastrophic, plus "No rating" ([DFES](https://news.dfes.wa.gov.au/media-releases-feature-stories/new-fire-danger-ratings-launching-1-september-2022/)).
- **Emergency Alert** (2009): een sms van 0444 444 444 en een gesproken bericht naar vaste lijnen in het gebied. Sinds 2012-13 wordt het aan mobiele telefoons gestuurd op basis van hun locatie.
- **AusAlert**, de cell broadcast (vergelijkbaar met NL-Alert):
  - landelijke test op 27 juli 2026, live sinds 1 oktober 2026 ([NEMA](https://www.nema.gov.au/our-work/risk-reduction/ausalert), [Wangaratta Chronicle](https://www.wangarattachronicle.com.au/news/ausalert-now-part-of-nations-emergency-plan-i2tnbt0c));
  - twee soorten: Critical, dat door stil heen breekt, en Priority. Werkt vanaf iOS 26.4 en Android 12;
  - elke staat beslist zelf of hij het gebruikt. In juli had alleen ACT dat publiek bevestigd ([ABC](https://www.abc.net.au/news/2026-07-22/emergency-warning-system-in-doubt-as-states-raise-concerns/106942870)). De sms blijft dit seizoen;
  - **er is geen openbare feed van.**
- **CAP-AU:** het Australische profiel van CAP 1.2 (2012/2013), met Australische gebeurteniscodes ([OASIS](https://docs.oasis-open.org/emergency/edxl-cap1.2-au/v1.0/edxl-cap1.2-au-v1.0.html)). Victoria's OSOM ("One Source One Message") zet één invoer tegelijk door naar website, app, social media en feed.
- **AIDR-richtlijn voor herpublicatie**, die voor ons geldt ([AIDR](https://knowledge.aidr.org.au/media/10573/aidr_warnings-republishers_companion.pdf)):
  - tekst en gebied ongewijzigd laten;
  - bron, datum en tijd tonen;
  - updates en afschalingen ook doorgeven;
  - onofficiële informatie labelen.
  
  Voor gebruik van de AWS-iconen gelden voorwaarden van AIDR/AFAC.

## 4. Pagers en capcodes

| Staat | Netwerk | Protocol | Versleuteld | Wie erop |
|---|---|---|---|---|
| VIC | Emergency Alerting System (EAS): 228 masten met elk 2 zenders, satellietgevoed. ±34.000 pagers, ruim 2 miljoen berichten in 2024-25 | POCSAG, twee frequenties | Nee | CFA, FRV, VICSES, Ambulance Victoria |
| SA | SAGRN-paging: 172 masten, ruim 20.000 pagers, gekoppeld aan SACAD | FLEX 1600 | Nee | CFS, MFS, SES, SAAS, MedSTAR |
| NSW | RFS (±288 zenders), FRNSW regio (182) en metro (70), NSW Health (25). Sydney-netwerk sinds 2022 | POCSAG | Sydney kan het ("TPL Encryption enabled"); ⚠ onbekend of het aanstaat | RFS, FRNSW, SES |
| TAS | TasGRN-paging: 54 masten, ±7.500 gebruikers | POCSAG | ⚠ onbekend; spraak sinds 2023 wel | Brandweer, SES, ambulance |
| QLD | Vooral de app FAST Qld en 4G-pagers | Weinig POCSAG | n.v.t. | RFSQ, QFR, SES |
| WA | Geen pagernetwerk meer, vooral sms | n.v.t. | n.v.t. | n.v.t. |
| ACT/NT | Beperkt; ⚠ weinig bekend | POCSAG (NT) | ⚠ | n.v.t. |

Bronnen:
- [ARCIA 2026](https://arcia.org.au/wp-content/uploads/2026/05/arcia-_hamish-duff_2026.pdf);
- [TPL/ARCIA 2024](https://arcia.org.au/wp-content/uploads/2024/07/6.-brad-welch_brisbane.pdf);
- [TZV-jaarverslag 2024-25](https://www.triplezero.vic.gov.au/sites/default/files/2026-01/Triple-Zero-Victoria-2024-25-Annual-Report.pdf);
- [SA AGD 2025](https://arcia.org.au/wp-content/uploads/2025/09/1.-peter-sinclair.pdf);
- [ABC 2014, "not encrypted"](https://www.abc.net.au/news/2014-10-23/emergency-pager-system-should-be-encrypted-says-expert/5833900).

**Victoria, EAS:**
- Gebouwd vanaf 2005 voor ±$100 miljoen met VEC Network.
- Beheer door Visionstream vanaf 2012 (contract $70 miljoen, [techpartner](https://www.techpartner.news/news/victoria-inks-70m-emergency-alert-deal-271768)).
- Het contract valt sinds april 2024 onder het ministerie van Justitie (DJCS).
- Sinds november 2024 worden ±25.000 pagers vervangen ([CFA](https://www.members.cfa.vic.gov.au/news/pager-replacement-project-underway)).

**NSW:** in 2022 kreeg de staat $145,7 miljoen voor één staatsbreed netwerk. Volgens het jaarverslag 2024-25 is de uitgave doorgeschoven, dus ⚠ de status is onduidelijk ([NSWTA](https://www.parliament.nsw.gov.au/tp/files/192028/NSW%20Telco%20Authority%20Annual%20Report%202024-25.pdf)).

**Berichtformaat (Victoria).** Voorbeeld van 24-10-2026 ([Mazzanet](https://www.mazzanet.net.au/cfa/pager-cfa-all.php)):

```
@@ALERT GRWN3 INCIC3 WASHAWAY RESULT OF ACCIDENT HUME FWY GLENROWAN SVNE 5785 H7 (279636)
```

- **Prioriteit:**
  - `@@ALERT` is spoed, dus uitrukken.
  - `Hb` is niet-spoed of een update, bijvoorbeeld `HbRE: EVENT [F…] - STOP MESSAGE RECEIVED`.
  - ⚠ Dat `QD` een beheerbericht is, is niet bevestigd.
- **Brigade:** `GRWN3` is de brigadecode plus een alarmgroep. Vijfcijferige codes horen ⚠ vermoedelijk bij FRV-gebieden.
- **Incidenttype plus code:**
  - STRUC is een gebouwbrand, G&SC gras of struiken, NOSTC een buitenbrand zoals een auto, ALARC een brandmelding, RESCC een redding en INCIC overig.
  - De 1 of 3 is ⚠ vermoedelijk Code 1 (met spoed) of Code 3 (zonder).
  - `AFEM` staat bij medische co-responses (reanimatie).
- **Kaartverwijzing:**
  - `M 100A C6` is een pagina en vak in de Melway.
  - `SVNE/SVC nnnn Xn` verwijst ⚠ vermoedelijk naar de Spatial Vision-kaartboeken.
  - `(279636)` is een rastercoördinaat.
- **Achteraan:** het incidentnummer `F` + jaar + maand + volgnummer, `C` + brigadecode voor een hele brigade, en voertuigen zoals `P94` en `PT31`.
- **Formaatwijziging, december 2018:** het incidentnummer staat achteraan. Medische berichten bevatten instanties en het ambulance-casusnummer ([VFBV](https://vfbv.com.au/index.php/links/item/658-changes-to-pager-message-format-rolling-out-in-december)). Bij reanimaties staan er ook adres, leeftijd en geslacht in ([AEL 2025](https://australianemergencylaw.com/2025/09/04/health-information-on-cfa-brigade-pagers/)).
- **Capcodes:** 7 cijfers. De nieuwe pagers hebben capcodes die de brigade zelf instelt, en brigades beheren pagergroepen in de SAS-app. Er is geen openbare capcodelijst.

**Wie het al ontvangt of verkoopt:**
- **Mazzanet (VIC):** live, inclusief medische berichten met adres. Op de pagina staat "STOP SCRAPING AND REPUBLISHING". CFA heeft ooit geprobeerd hem te laten sluiten.
- **VicPagers (VIC):** iOS-app (2026) voor CFA, SES en FRV ([App Store](https://apps.apple.com/au/app/vicpagers/id6759511911)).
- **CFSScan (SA):** sinds 2017, betaald vanaf ±$4,25 per maand, 50.000+ Android-installaties, inclusief SAAS en MedSTAR. De voorwaarden verbieden herpublicatie.
- **SApaging.com (SA):** sinds 2018, SDR op meer dan 6 locaties, multimon-ng en PDW ([about](https://sapaging.com/about.html)).
- **RFSPager (NSW):** eigen SDR-ontvangers, betaalde Pro ([feed](https://rfspager.app/pager)).
- **IncidentWatch en DataQuoll (SA):** koppelen pagerberichten aan officiële incidenten. Directe concurrenten.
- **PagerMon:** open-source software ervoor; geen Australische openbare installatie gevonden.

**Gestopt:**
- een EAS-archief alleen voor leden (±2010), om juridische redenen;
- een Tasmaanse site met ambulanceberichten, november 2020 tot januari 2021, met onder meer HIV-status ([UpGuard](https://www.upguard.com/news/tasmanian-ambulance-patient-data-breach)). Ambulance Tasmania haalde daarna de persoonsgegevens uit de berichten;
- WA Health (juli 2020): een site met berichten via Vodafone-paging. WA Health stopte daarna met pagers ([GovTech Review](https://www.govtechreview.com.au/content/gov-security/article/wa-patient-records-leaked-online-36923219)).

**Trends:**
- Officiële apps bovenop de pager: SAS in VIC (2020, [CFA](https://news.cfa.vic.gov.au/news/new-app-makes-turning-out-easier)), FAST Qld, en een ACT-aanbesteding in 2022.
- BART als app van een externe leverancier.
- 4G-pagers, bijvoorbeeld de Birdy bij FRNSW.
- Versleutelde digitale radio.
- PSMB, mobiel breedband voor hulpdiensten, ⚠ nog niet rond.

## 5. Juridisch: pagerdata ontvangen en publiceren

**Telecommunications (Interception and Access) Act 1979** ([wettekst](https://www.legislation.gov.au/C2004A02124/latest/text)):
- **s7(1)** verbiedt het onderscheppen van "a communication passing over a telecommunications system".
- **s5** sluit "a system … for carrying communications solely by means of radiocommunication" uit.
- **s63** verbiedt gebruiken of doorgeven van wat in strijd met s7 is verkregen.
- **s105:** tot 2 jaar cel.

**Twee lezingen:**
1. Paging is omroep via radio, dus de wet is niet van toepassing.
2. Berichten beginnen in het meldkamersysteem en lopen via IP en satelliet naar de masten. Het netwerk is dan niet "solely" radio, en ontvangen vóór de pager het heeft, is interceptie.

Volgens noodrechtdeskundige Michael Eburn is het een feitenkwestie ([AEL 2016](https://australianemergencylaw.com/2016/03/09/intercepting-emergency-service-pager-messages/)). Er is geen uitspraak of vervolging gevonden.

**Andere wetten:**
- **Radiocommunications Act 1992:** geen delict voor ontvangst; scanners zijn volgens Eburn legaal ([AEL 2024](https://australianemergencylaw.com/2024/12/30/using-a-scanner-to-listen-to-dfes-wa-radio/)).
- **Surveillance Devices Act** van de staten: gaat over "private conversation" en spraak. Tekstberichten vallen er waarschijnlijk buiten.
- **Privacy:**
  - Een betaalde app die berichten doorgeeft, kan de uitzondering voor kleine bedrijven in de Privacy Act verliezen (s6D(4)).
  - Gezondheidsgegevens zijn gevoelige informatie.
  - **Sinds 10 juni 2025 is er een privacy-tort:** iemand kan je aanklagen voor een ernstige, opzettelijke of roekeloze inbreuk zonder schade te bewijzen ([Mills Oakley](https://www.millsoakley.com.au/insights/the-tort-of-privacy-a-first-in-australia/)).

**Hoe instanties reageren:**
- VICSES (2016): zulke apps zijn "actually illegal".
- De Tasmaanse minister van Volksgezondheid (2021) wilde "the full force of the law" ([Examiner](https://www.examiner.com.au/story/7082104/health-minister-angry-at-ambulance-privacy-breach/)).
- De politie van West-Australië sloot in 2020 de WA Health-site ([The Mandarin](https://www.themandarin.com.au/136360-teenager-allegedly-behind-wa-health-breach/)).

**Conclusie:** er is geen Nederlandse gedoogcultuur. Doen we het toch, dan nooit met patiëntgegevens (leeftijd, geslacht, medische details). Die zijn de aanleiding geweest voor sluitingen en voor versleuteling, en met versleuteling ben je je bron kwijt. Een advocaat is nodig voor de TIA Act per netwerk, het s63-risico, de Privacy Act en de tort.

## 6. Data en licenties per staat

| Staat | Feed | Inhoud (24-10) | Kleine incidenten | Licentie | In de app |
|---|---|---|---|---|---|
| VIC | `emergency.vic.gov.au/public/events-geojson.json` (de app); `osom-geojson.json` = hetzelfde plus 27 vlakken met uitgebrand gebied | CFA, FRV via de meldkamer, SES, DEECA en BOM. 27 objecten, waarvan 2 waarschuwingen | Ja. Geen ambulance of politie ([VicEmergency](https://support.emergency.vic.gov.au/hc/en-gb/articles/219081117-What-emergency-information-is-not-included)) | CC BY 3.0 AU, toon de laatste updatetijd ([EMV](https://www.emv.vic.gov.au/responsibilities/victorias-warning-system/emergency-data)). ⚠ Helppagina 2019: feed "not currently available publicly" | Ja |
| NSW | `rfs.nsw.gov.au/feeds/majorIncidents.json` (ook GeoRSS en CAP) | 15 RFS-inzetten, ook kleine. Géén FRNSW (stad) en SES | Ja, alleen RFS | CC BY 4.0 met voorgeschreven attributie; RFS behoudt het recht distributie te stoppen | Ja (elke 2 min) |
| QLD | `publiccontent-gis-psba-qld-gov-au.s3…/bushfireAlert.json` | 28 vegetatiebranden en 2 verbrandingen; waarschuwingen met alleen een gebied | Nee | CC BY 4.0 ([data.qld](https://www.data.qld.gov.au/dataset/784c9d08-e242-48df-a662-697cbdc3787c)) | Ja (elke 2 min) |
| SA | `data.eso.sa.gov.au/feeds/prod/cap-au.xml` (de app) | CFS-incidenten en -waarschuwingen | Ja | **Tegenstrijdig:** de [CFS-site](https://www.cfs.sa.gov.au/home/copyright/) zegt CC BY 4.0 voor "the content of this website", maar [data.sa.gov.au](https://data.sa.gov.au/data/dataset/south-australian-country-fire-service-current-incidents-rss-feed) noemt de incidentfeed CC BY-NC-ND 4.0 | Ja |
| ACT | `esa.act.gov.au/feeds/currentincidents.xml`, CAP: `data.esa.act.gov.au/feeds/esa-cap-incidents.xml` | 15 van 18 zijn ambulance-uitrukken, elke 60 s uit CAD | Ja, ook ambulance | CC BY 4.0, zelf geverifieerd ([ESA](https://data.esa.act.gov.au/be-emergency-ready/warnings-alerts)) | Ja |
| WA | `api.emergency.wa.gov.au/v1/incidents` (ook `/warnings`), ongedocumenteerd | 132 objecten: 87 burn-offs, 39 bosbranden, gebouwbranden, voertuigbrand, ongeval. Elke ±1 min | Ja | Officieel via SLIP-registratie. Incidenten CC BY 4.0, waarschuwingen CC BY-ND 4.0 ([DataWA](https://catalogue.data.wa.gov.au/dataset/dfes-emergencywa-incident-points-dfes-066)) | Nee |
| TAS | `alert.tas.gov.au/data/data.geojson`, ongedocumenteerd | Bosbranden, verbrandingen, een gebouwbrand, een stroomstoring | Deels | TasALERT: toestemming nodig. TFS: alleen niet-commercieel ([TFS](https://www.fire.tas.gov.au/Show?pageId=colCopyright)) | Nee |
| NT | `pfes.nt.gov.au/incidentmap/json/incidents.json` | 32 in 24 uur: brandmeldingen, ongevallen, grasbranden | Ja | Het bestand zegt "Please do not use, scrape or re-publish this file" | Nee |

**Extra bronnen:**
- **Live Traffic NSW** (`livetraffic.com/traffic/hazards/incident.json`, ±5 min): 31 ongevallen, waarvan 24 met hulpdiensten. CC BY 4.0 met API-sleutel; geen officiële status suggereren.
- **Victoria, Unplanned disruptions – Road:** CC BY 4.0, sleutel nodig. Zie het CFSScan-document.
- **QLD:** storm- en overstromingswaarschuwingen van de politie (CAP, CC BY 4.0). De QLDTraffic-API vraagt een eigen sleutel.
- **DEA Hotspots:** satellietbranden, Himawari elke 10 minuten. Via WFS `hotspots.dea.ga.gov.au/geoserver/public/wfs` (typeName `public:hotspots_three_days`). CC BY 4.0, "not for safety of life decisions" ([DEA](https://knowledge.dea.ga.gov.au/data/product/dea-hotspots/)).
- **BOM-waarschuwingen** (RSS, CAP via FTP): de gratis feeds zijn "not for commercial use". Een betaalde app vraagt een betaalde registratie ([BOM](https://www.bom.gov.au/catalogue/data-feeds.shtml)).
- **NSW SES-waarschuwingen:** alleen via het ongedocumenteerde `hazardwatch.gov.au/app-api/alerts`. Volgens de voorwaarden alleen "personal non-commercial use" ([HazardWatch](https://www.hazardwatch.gov.au/terms)).

**Merken:**
- "Emergency Alert" mag alleen ongewijzigd en niet-commercieel worden gebruikt.
- Het Triple Zero-logo: toestemming via NEMA.
- De Australian Consumer Law s29(1)(h) verbiedt een schijn van goedkeuring of verbondenheid.
- ⚠ Niet nagekeken: of "Fires Near Me" of "Hazards Near Me" geregistreerde merken zijn. Dat is relevant voor de naam "Emergencies Near Me".

## 7. Markt

| App | Dekking en model | iOS AU ★ (aantal) | Play |
|---|---|---|---|
| VicEmergency | VIC, gratis | 2,95 (756); recente reviews gem. 2,06 | 1M+ |
| Hazards Near Me NSW (ex-Fires Near Me, 2023) | NSW plus 50 km over de grens, gratis | Recente reviews gem. 1,99 (teller ⚠ gereset) | 1M+ |
| Fires Near Me Australia | Branden van deelnemende diensten, gratis | 2,40 (309) | 100K+ |
| Emergency WA (december 2024) | WA, gratis | 4,0 (201) | 100K+ |
| Alert SA (vernieuwd november 2024) | CFS, MFS, SES, gratis | **4,63 (11.410)** | 100K+ |
| TasALERT (augustus 2024) | TAS, gratis | 2,71 (34) | 10K+ |
| Bushfire.io | AU, VS, CA, satelliet; Pro A$4,49 | 4,33 (63) | 100K+ |
| **"VIC/QLD/SA Fires"** (P4G) | Eén staat per app, **A$1,99 eenmalig** | 4,7 met duizenden beoordelingen | 10K+ |
| CFSScan / RFSPager / VicPagers | Pagerberichten, abonnement | 3,35 (60) / 3,32 (19) / nieuw | 50K+ / 1K+ / 100+ |

**Wat opvalt:**
- QLD heeft geen eigen waarschuwingsapp gevonden, alleen websites.
- De NT-app SecureNT is sinds 2017 niet bijgewerkt.
- Emergency AUS (Gridstone) lijkt verdwenen: niet in de winkels, en het domein werkt niet. ⚠
- De P4G-apps staan op 1 (QLD), 3 (VIC) en 7 (SA) in de betaalde Nieuws-apps.
- Ember (VIC) is een nieuwe directe concurrent (zie september).

**Klachten** over de officiële apps, uit reviews:
- te veel meldingen ("hoe heet het wordt, 500 km verderop", burn-offs buiten je zone);
- gemiste meldingen (vergeten watch zones, geen meldingen na een update);
- grensbranden die in twee apps verschillend staan.

Officiële apps kijken maar 50–100 km over de grens.

## 8. Stand van de app (24-10-2026)

- **iOS 1.0.0** is op 23-10 om 13:49 UTC ingediend en wacht op review. Het abonnement `premium_year` wacht ook op review.
- **Naam en zoekwoorden in de App Store:**
  - naam "Emergencies Near Me", ondertitel "Bushfire, flood & crash alerts";
  - zoekwoorden: `bushfire,fire,flood,emergency,alert,warning,incident,storm,SES,ambulance,crash,VIC,NSW,QLD,map`.
- **Bronnen:** VIC, NSW, QLD, SA en ACT, alle vijf gezond. NSW en QLD worden sinds PR #15 elke 2 minuten opgehaald.
- **Android:** gesloten test, zie de geheugennotitie over de testperiode van 14 dagen.

## 9. Vervolglijst

| # | Wat | Status |
|---|---|---|
| 1 | Push op waarschuwingsgebied: wie in het gebied staat, krijgt hem, ook zonder pin | **Gedaan**, PR #15 (24-10) |
| 2 | NSW en QLD elke 2 minuten ophalen in plaats van elke 30 | **Gedaan**, PR #15 |
| – | Eén push per gebeurtenis (NSW-dubbel) | **Gedaan**, PR #15 |
| 3 | Zoekwoorden: SA en ACT toevoegen, woorden uit naam en ondertitel weghalen, steden en CFA/RFS/CFS erbij. Promotietekst invullen (kan altijd) | Open; zoekwoorden pas bij de volgende versie |
| 4 | Meerdere plekken (thuis, werk, ouders, vakantiehuis), zonder achtergrondlocatie | Open |
| 5 | Meldingsbeheer: per plek soort en niveau, burn-offs standaard stil, stille uren met doorbraak voor een Emergency Warning | Open |
| 6 | Kritieke meldingen | **Geparkeerd**, zie §10 |
| 7 | Brandgevaar en Total Fire Ban van vandaag per district, met een ochtendpush bij Extreme, Catastrophic of TFB | Open |
| 8 | Live Activity voor een lopende Emergency Warning en een widget (brandgevaar plus dichtstbijzijnde incident) | Open |
| 9 | WA, TAS en NT erbij: alle acht staten en territoria | Open (licentie, zie §6) |
| 10 | Verkeersongevallen: Live Traffic NSW, VIC-wegverstoringen, QLDTraffic | Open |
| 11 | Satellietbranden (DEA) als "mogelijk nieuwe brand" | Open |
| 12 | BOM-weerwaarschuwingen en NSW SES-waarschuwingen | Open (licentie) |
| 13 | Eigen pagerontvangers in Melbourne (POCSAG), Adelaide (FLEX 1600) en Sydney (POCSAG). De Pi-opstelling van P2000 (rtl_fm + multimon-ng) kan het; ±€150 per locatie bij een tester. Patiëntgegevens altijd eruit | Open (juridisch, zie §5) |
| 14 | Deelpagina per incident met kaartbeeld op emergenciesnearme.online, plus live pagina's per staat en grote stad. Geen duizenden dunne pagina's | Open |
| 15 | Prijs testen: naast het jaarabonnement een eenmalige aankoop. Gratis: één plek; Pro: meerdere plekken, kritiek, pagers, satelliet | Open |
| 16 | Timing: het bosbrandseizoen begint nu. Android naar productie na de gesloten test, en klaarstaan voor de eerste grote branddag | Open |

**Licentieacties vóór de betaalde lancering:**
- CFS (SA) en EMV (VIC) om schriftelijke bevestiging vragen;
- WA via SLIP registreren;
- de merknaam nakijken bij IP Australia.

## 10. Kritieke meldingen: geparkeerd op 24-10-2026

**Stand:**
- Apple heeft de Critical Alerts-entitlement op 10-05-2026 aan het account toegekend, met als gekoppelde app-ID alleen `nl.p2000alarm.app` (mail "You can now use Critical Alerts entitlement.").
- De bundle-ID van de AU-app (`com.chrisschepers.dispatchau`, resource-ID `9US78L89U5`) heeft alleen `IN_APP_PURCHASE` en `PUSH_NOTIFICATIONS`. De P2000-bundle heeft wel `CRITICAL_ALERTS`.
- De App Store Connect-API kan deze beheerde capability niet aanzetten. `POST /v1/bundleIdCapabilities` met `CRITICAL_ALERTS` geeft 409 "not a valid value for the attribute 'capabilityType'". Er is niets veranderd.
- **De backend is klaar** (PR #15). Het filterveld `critical` stuurt een Emergency Warning voor de eigen plek als kritieke melding: APNs met `sound.critical` en `interruption-level: critical`, en op Android het kanaal `dispatch_kritiek`. Dat gebeurt nooit via "Emergency Warnings anywhere". Zie `docs/PUSH-API.md`.

**Vervolgstappen:**
1. Chris logt zelf in op developer.apple.com: Identifiers → `com.chrisschepers.dispatchau` → Additional Capabilities. Kijk of Critical Alerts daar aan te vinken is.
2. Zo niet, aanvragen via <https://developer.apple.com/contact/request/notifications-critical-alerts-entitlement/> met de concepttekst hieronder. Laat Chris de tekst zien vóór het versturen.
3. Na goedkeuring:
   - capability op de App-ID zetten;
   - een nieuw App Store-provisioningprofiel maken (lokale ondertekening met een eigen sleutelhanger, zie `mobile/release/README.md`);
   - in de app: `com.apple.developer.usernotifications.critical-alerts` in `app.config.ts`, `requestPermissionsAsync({ ios: { allowCriticalAlerts: true } })`, en een schakelaar in Instellingen die standaard uit staat en `critical` in het filter zet;
   - op Android eerst het kanaal `dispatch_kritiek` aanmaken (alarmgeluid, mag door Niet storen) vóór `critical` aan kan;
   - daarna een nieuwe build (1.0.1 of later).

**Concepttekst voor de aanvraag:**

> Emergencies Near Me (com.chrisschepers.dispatchau, Apple ID 6811057872) alerts people when an official **Emergency Warning**, the highest level of the Australian Warning System (for example a bushfire "Leave now"), is issued for the place where they are or a place they saved. The data comes from official state agencies (VicEmergency, NSW RFS, Queensland Fire Department, SA CFS, ACT ESA). Critical alerts are opt-in and off by default. They are used only for Emergency Warnings that cover the user's own location, never for lower warning levels or nationwide alerts. For a user in a high-risk area that means a few times a year at most. These warnings often come at night, when phones are silenced, and minutes matter for evacuation. Our app P2000 Alarm (nl.p2000alarm.app) already uses critical alerts this way.
