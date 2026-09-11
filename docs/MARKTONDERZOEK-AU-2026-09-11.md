# Dispatch: bronaanbod en commerciële kans opnieuw beoordeeld

Onderzocht op 11 september 2026. Dit rapport vervangt de eerdere aanname dat Victoria al een overtuigend bewezen startmarkt was. Het onderzoekt alle zes deelstaten en beide hoofdterritoria. De app is tijdens dit onderzoek niet gewijzigd.

## Advies

**Behoud het prototype, stel verkoop en verdere vormgeving uit en valideer eerst Victoria en Canberra/ACT met een meting van het dagelijkse aanbod.** ACT is de sterkste nieuw gevonden kandidaat voor een proef met officiële meldkamerdata. South Australia verdient een apart onderzoek naar een overeenkomst met een pagerleverancier. Een landelijke brandenkaart heeft op zichzelf weinig onderscheid ten opzichte van bestaande apps.

Er is een aantoonbaar aanbod van openbare incidenten én er bestaan betaalde pagerdiensten. Er is nog geen bewijs dat Dispatch voldoende dagelijks gebruik of betalende klanten zal krijgen. Zowel mijn eerdere enthousiasme over Victoria als de latere suggestie dat het beperkte scherm de markt vrijwel uitsluit, waren te stellig.

## Wat de kleine lijst werkelijk betekent

De Victoria-controle van 14:28 UTC was **00:28 op 12 september in Melbourne**. De bron bevatte 12 objecten: 11 voor Victoria, waarvan twee geplande branden. Van de negen overige Victoria-incidenten vielen er acht binnen 100 km van Melbourne. Dat past bij de kleine lijst op de screenshot. Het is geen telling van alle uitrukken op 11 september.

De huidige native app vervangt bij verversen de vorige broninhoud. Hij verzamelt geen historie wanneer de app dicht is. Een incident dat uit de bron verdwijnt, verdwijnt dus uit de lijst. De datumgroepen en getoonde tijden zijn bovendien gebaseerd op de **laatste incidentupdate**, niet noodzakelijk het eerste meldingsmoment. Gecontroleerd in `mobile/src/useDispatch.ts` en `mobile/App.tsx`.

Drie afzonderlijke zaken bepalen de ervaring: hoeveel unieke incidenten per dag worden gepubliceerd, hoe lang ze beschikbaar blijven, en hoeveel daarvan binnen de eigen omgeving vallen. Een tijdlijn met de afgelopen 24 uur kan nuttig zijn, maar mag oude of bijgewerkte incidenten niet als nieuwe uitruk presenteren. Een ruimere straal of extra deelstaat levert evenmin automatisch meer lokale relevantie op.

## Rechtstreekse bronmetingen

Eenmalige HTTP-controles zonder accounts of API-sleutels. Alle tijden hieronder zijn UTC op 11 september 2026. Dit zijn bronrecords, **geen vergelijkbare dagtotalen**. Waarschuwingen en incidenten kunnen hetzelfde voorval beschrijven. De bron-URL's en exacte meetwaarden staan ook in [de meetnotities](research/2026-09-11-feed-snapshots.json).

| Bron | Tijd | Waargenomen | Betekenis |
| --- | --- | --- | --- |
| Victoria Events | 14:28 | 12 records; 9 gewone Victoria-incidenten; 8 daarvan binnen Melbourne 100 km | Kleine actuele lijst bevestigd; geen dagvolume gemeten |
| ACT ESA GeoRSS | 14:42 | 16 records: 14 ambulance-uitrukken, 2 geplande branden | Officiële bron bevat daadwerkelijk gewone ambulance-uitrukken |
| NSW RFS GeoJSON | 14:42 | 55 records | Onder meer 24 bushfires, 5 grass fires, 19 hazard reductions, 3 planned events; dus geen 55 nieuwe uitrukken |
| SA CFS RSS | 14:42 | 4 records | 1 prescribed burn, 2 burn offs, 1 other |
| SA MFS ArcGIS | 14:43 | 3 records | 1 vehicle accident, 1 building fire, 1 burn off; geen aangetoonde volledigheid van alle MFS-uitrukken |
| Queensland JSON | 14:43 | 52 records | 6 waarschuwingen en 46 overige incidentrecords, inclusief 5 permitted burns; geen 52 unieke noodsituaties |

Een tweede ACT-controle om 14:44 bevatte 15 records: 13 ambulance-uitrukken en twee geplande branden. De call-datums waren 11 en 12 september. De feed veranderde dus, maar twee controles bewijzen geen dagvolume of volledigheid. De generieke categorie `AMBULANCE RESPONSE` bevat geen diagnose; die mogen we ook niet suggereren.

De oudere TFS-feed gaf HTTP 410 met een verwijzing naar een vervangende TasALERT-feed. Die vervanger gaf in deze controle een geldig maar leeg RSS-document. De actuele TasALERT-instructie vereist toestemming voor feedtoegang. Dit is geen bewijs dat Tasmania geen incidenten heeft en geen inzetbare brongoedkeuring.

## Beoordeling per gebied

### ACT / Canberra — beste nieuwe kandidaat voor een beperkte pilot

ESA beschrijft een GeoRSS-feed die elke 60 seconden rechtstreeks uit het meldkamersysteem wordt bijgewerkt. De incidentfeed bevat geen officiële waarschuwingen; daarvoor bestaat een afzonderlijke CAP-route. De organisatie vermeldt expliciet CC BY 4.0 voor Current Incidents en News Alerts, met bronvermelding. [ESA-broninformatie](https://data.esa.act.gov.au/be-emergency-ready/warnings-alerts)

De eigen livecontrole bevestigde ambulanceberichten. De officiële website biedt deze incidenten ook aan, met ambulance standaard verborgen achter een filter. [ESA-kaart](https://esa.act.gov.au/?fullmap=true)

Mijn beoordeling: inhoudelijk dichter bij het gewenste dagelijkse uitrukkenoverzicht dan alleen bushfiremeldingen. De beperking is de marktomvang: ACT telt circa 487.200 inwoners, tegenover 7,12 miljoen in Victoria en 1,91 miljoen in South Australia, volgens de bevolkingsstand van december 2025. Inwoners zijn vanzelfsprekend geen potentiële betalende klanten in dezelfde verhouding. [ABS](https://www.abs.gov.au/statistics/people/population/national-state-and-territory-population/latest-release)

### Victoria — nog niet afschrijven

De bron werkt en bevat reguliere brandweer- en reddingsincidenten. De huidige kleine lijst bewijst geen laag dagelijks aanbod. Victoria blijft daarom een kandidaat naast ACT, met het bestaande prototype als voordeel.

De commerciële voorwaarden voor de samengestelde feed blijven in dit onderzoek **niet zelfstandig bevestigd**. CFA maakt onderscheid tussen persoonlijk RSS-gebruik en data voor ontwikkelaars. [CFA](https://www.cfa.vic.gov.au/rss-feeds)

Nieuwe aanwijzing: leverancier DataQuoll verwijst naar een specifieke EMV Emergency data-licentie onder CC BY 3.0 AU. De genoemde primaire EMV-pagina gaf zowel via de webtool als rechtstreeks HTTP 403; de tekst kon ik niet verifiëren. Dit is een gerichte openstaande verificatie, geen bewijs dat commercieel gebruik verboden is. De claim van de leverancier vervangt die controle niet. [DataQuoll-verantwoording](https://dataquoll.io/compliance), [genoemde EMV-pagina](https://www.emv.vic.gov.au/responsibilities/victorias-warning-system/emergency-data)

### South Australia — beste aansluiting bij echte pagerinhoud, nog geen bewezen leverancier

CFS publiceert officiële RSS-feeds. Daarnaast is een openbare MFS ArcGIS-service aangetroffen, met voertuigongeval en gebouwbrand in de actuele gegevens. Het metadata-veld `licenseInfo` van die service was leeg. De afzonderlijke SES-route is in deze ronde niet rechtstreeks gevalideerd. De kleine CFS- en MFS-snapshots bewijzen geen voller dagelijks product. [CFS-feeds](https://www.cfs.sa.gov.au/warnings-restrictions/warnings/rss-feeds/), [MFS-service](https://cfs.geohub.sa.gov.au/server/rest/services/CFS_Incident_Read/MFS_Incidents/FeatureServer)

Er bestaan ook community-pagerfeeds met dispatchdetails. DataQuoll onderscheidt deze expliciet van officiële publicaties. Het ontsluiten van zo'n feed vergt verificatie van de leverancier, herpublicatierechten, toegestane velden, volledigheid en continuïteit. De technische bereikbaarheid of aanwezigheid in een betaalde API beantwoordt die vragen niet. [Providerbeschrijving](https://dataquoll.io/guides/states/sa)

Mijn beoordeling: interessant voor een product voor hulpdienstenliefhebbers, maar geen automatische vervanging van Victoria. Een betaalde pager-app bestaat hier al: CFSScan. Dat is een marktindicatie én directe concurrentie.

### NSW — goed te koppelen, minder geschikt als enige basis

RFS publiceert RSS, CAP en GeoJSON en noemt CC BY 4.0 plus voorgeschreven attributie. De gedocumenteerde updatefrequentie is 30 minuten. De controle bevatte ook een verkeersongeval, maar vooral branden en geplande activiteiten. Het is geen bewijs van volledige stedelijke brandweer-, politie- of ambulancealarmering in NSW. [RFS-feeds en voorwaarden](https://www.rfs.nsw.gov.au/news-and-media/stay-up-to-date/feeds)

Beoordeling: nuttige latere uitbreiding; de 55 records rechtvaardigen geen belofte van een drukke lokale uitrukkenapp voor Sydney.

### Queensland — bruikbaar voor brandinformatie

De officiële dataset noemt vegetatiebranden en permitted burns, 30 minuten updates en CC BY 4.0. De actuele JSON bevat daarnaast waarschuwingsrecords, waaronder een `Other`-waarschuwing. De implementatie moet dus het werkelijk aangeleverde schema volgen en waarschuwingen van incidenten onderscheiden. Veel records betekent niet dat er een brede 000-uitrukkenfeed beschikbaar is. [Queensland-dataset](https://www.data.qld.gov.au/dataset/queensland-fire-and-rescue-current-bushfire-incidents)

### Western Australia — geen snelle eerste koppeling

Emergency WA toont incidenten en biedt gepersonaliseerde watch zones. Voor de onderzochte Warning Areas-dataset vermeldt DataWA een toegangsaanvraag en CC BY-ND 4.0. Die specifieke dataset is niet hetzelfde als alle actuele incidenten. Beschikbare publieke waarschuwingenfeeds en de voorwaarden daarvan moeten afzonderlijk worden beoordeeld. [DFES FAQ](https://www.dfes.wa.gov.au/emergencywa/faq), [DataWA Warning Areas](https://catalogue.data.wa.gov.au/dataset/dfes-emergencywa-warning-areas-dfes-068)

### Tasmania — oude documentatie geeft een te rooskleurig beeld

De TFS-pagina staat herpublicatie onder CC BY 4.0 toe met updatevermelding en disclaimer, maar de gekoppelde statewide-feed is beëindigd. TasALERT vraagt nu contact voor feedtoegang. Niet zonder verificatie de oude TFS-licentie aan de vervangende gecombineerde feed hangen. [TFS-feeds](https://www.fire.tas.gov.au/Show?pageId=xmlFeedsHome), [TasALERT feedtoegang](https://alert.tas.gov.au/about-app)

### Northern Territory — incidentkaart aanwezig, integratie niet gekwalificeerd

De officiële kaart beschrijft branden, verkeersongevallen, alarmen en andere incidenten, met circa 10–15 minuten updates. Een geschikte API met bevestigde commerciële voorwaarden is in deze ronde niet vastgesteld. De afzonderlijke newsroom-RSS vraagt schriftelijke toestemming voor distributie; die beperking mag niet zomaar op de kaartdata worden geprojecteerd. [NT incidentkaart](https://pfes.nt.gov.au/fire-and-rescue-service/fire-incident-map), [newsroom-RSS](https://pfes.nt.gov.au/newsroom/rss-feeds)

## Wat gebruikers al kunnen downloaden

| Product | Gecontroleerd aanbod | Implicatie voor Dispatch |
| --- | --- | --- |
| VicEmergency | Gratis; incidentkaart, waarschuwingen en watch zones | Alleen kaart, locatie en push zijn onvoldoende onderscheid. [App Store](https://apps.apple.com/au/app/vicemergency/id356559665) |
| Hazards Near Me NSW | Branden, overstromingen, tsunami's, activiteiten en push | Brede veiligheidsinformatie heeft al een officiële aanbieder. [NSW Government](https://www.nsw.gov.au/emergency/hazards-near-me-app) |
| Alert SA | Gratis, zonder verplichte aanmelding; onder meer urban fire, bushfire, storm/tree down, hazmat en watch zones | De officiële SA-app is inmiddels breder dan alleen bushfires. [Alert SA](https://alert.sa.gov.au/?trk=public_post-text) |
| Fires Near Me Australia | Gratis landelijke brandenapp; kaart, watch zones en notificaties | Alleen alle staten samenvoegen is geen uniek verkoopargument. [App Store](https://apps.apple.com/au/app/fires-near-me-australia/id406270824) |
| CFSScan | GRN-pagerdienst met capcodes, trefwoorden en regels; prijs geadverteerd vanaf $4,25 per maand bij jaarplan | Betaald gespecialiseerd aanbod bestaat; aantallen abonnees en winst zijn niet vastgesteld. Valuta niet afzonderlijk bevestigd op de bekeken prijspagina. [CFSScan](https://www.cfsscan.com/monitoring) |

App Store-beoordelingen, providerclaims en de aanwezigheid van een prijs bewijzen geen downloads, omzet of betalingsbereidheid voor Dispatch. Er is geen betrouwbare acquisitie- of conversieschatting uit dit onderzoek gekomen.

## Een gezamenlijke API inkopen?

DataQuoll adverteert alle bronnen vanaf een gratis evaluatielaag van 5.000 aanvragen per maand; Starter A$9 per maand met 50.000 aanvragen en een jaar historie. Eén aanvraag per minuut is 43.200 aanvragen in 30 dagen, vóór paginering, extra endpoints en herhalingen. Rechtstreeks elke telefoon laten pollen schaalt dus anders dan één centrale collector. [Prijsinformatie](https://dataquoll.io/pricing)

Het bespaart mogelijk ontwikkeltijd, maar de leverancier vermeldt zelf dat de commerciële SA-aanvraag nog op antwoord wacht. Ook verschilt zijn oordeel over Tasmania van de actuele TasALERT-toegangsroute. Daarom geen leverancier gekozen of abonnement afgesloten. Voor een pilot met ACT is de directe officiële feed een eenvoudiger begin.

## Wat Dispatch wel kan onderscheiden

De te testen productbelofte is: **snel terugzien welke openbare hulpdienstincidenten er vandaag in je eigen omgeving waren**. Met de rustige indeling Nearby, Map en Settings die de gebruiker heeft gekozen.

Een bruikbare pilot combineert een echte tijdlijn met herkenbare categorieën, betrouwbare meldings- en updatetijden, duidelijke bronstatus en weinig dubbele notificaties. Een verdwenen bronrecord betekent niet automatisch dat het incident veilig of afgerond is. Een politie- of ambulancefilter verschijnt alleen waar de betreffende bron die categorie werkelijk publiceert.

Een abonnement wordt pas een zinvolle test wanneer gebruikers terugkomen en meerwaarde ervaren van bijvoorbeeld meerdere gebieden of specifieke notificatieregels. De eerder voorgestelde A$4,99 is een testprijs, geen onderzoeksuitkomst. Extra Apple-effecten en een grotere kaart lossen een te dunne of onbetrouwbare tijdlijn niet op.

## Concrete vervolgfase en besliscriteria

**Nog niet uitgevoerd:** een doorlopende meting van veertien dagen en een gebruikerspilot. De momentopnamen hierboven zijn het afgeronde verkennende onderzoek; hieronder staat het vervolgexperiment.

Veertien dagen geven een eerste indicatie en dekken geen volledig brand- of stormseizoen. Bevestig een positief resultaat later ook in rustigere omstandigheden voordat jaarlijkse omzet of landelijke groei wordt geraamd.

1. Meet ACT en Victoria per broninterval, met bron-ID, eerste waarneming, bronaanmaak, bronupdate, laatste waarneming, type en globale locatie. Verifieer voor Victoria de specifieke voorwaarden voor deze opslag. Houd de eerste dag apart: reeds aanwezige records zijn geen nieuwe meldingen.
2. Rapporteer per lokale dag unieke nieuwe incidenten, wijzigingen, tijd in de feed en stille uren. Splits gewone incidenten, geplande activiteiten en waarschuwingen. Vergelijk vaste gebieden rond Melbourne en Canberra op 10, 25 en 50 km; alleen het staatstotaal is onvoldoende. Houd zomertijd en bronklokken expliciet bij.
3. Controleer duplicaten en gemiste records met gelijktijdige officiële snapshots. Meet publicatietijd tot eigen ontvangst; beweer niet de werkelijke 000-oproeptijd of pushvertraging te kennen als die niet gemeten is. Een incident tussen twee polls kan worden gemist.
4. Test daarna met 30–50 lokale gebruikers. Voorgestelde eigen beslisdrempels: minstens 10 gewone unieke incidenten per dag binnen het gekozen 25-km-proefgebied op minstens 10 van 14 dagen, en minstens 30% van de geactiveerde testers gebruikt de app in week twee op drie verschillende dagen. Dit zijn vooraf gekozen productcriteria, geen branchenormen. Meer generieke ambulanceberichten is niet automatisch meer waarde; vraag ook naar inhoudelijke bruikbaarheid.
5. Test vervolgens echte betalingsbereidheid bij een expliciet aanbod. Bij 50 geactiveerde testers zouden vijf echte betalende klanten een eerste positief signaal zijn, nog geen bewijs van schaalbaarheid. Meet daarna behoud en opzeggingen; laat geen fictieve aankoopknop gelden als omzet.

Een collector en database kunnen in een apart Dispatch-project op Railway draaien; de huidige app kan zonder Railway actuele gegevens tonen. Railway maakt de bron niet vollediger. Voor de beschreven veertiendaagse proef is betrouwbare achtergrondopslag nodig, geen extra scherm in de app. Er is tijdens dit onderzoek geen Railway-dienst, betaling, automatische monitor of externe correspondentie gestart.

**Beslissing nu:** ACT als eerste extra kandidaat testen, Victoria niet weggooien, SA als mogelijke pagerroute onderzoeken. Pas na gemeten lokaal aanbod en herhaalgebruik kiezen we waar het betaalde product wordt gelanceerd.
