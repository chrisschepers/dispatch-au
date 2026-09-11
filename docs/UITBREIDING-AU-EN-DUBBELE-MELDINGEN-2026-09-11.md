# Dispatch Australia: dekking en herstel van dubbele meldingen

## Bevindingen bij de screenshots

De melding in Horsham was aanwezig in onze Victoria-opslag, maar ligt buiten het gekozen gebied Melbourne + 100 km. De officiële website liet daarnaast een NSW/RFS-record voor Caldwell zien. Dispatch's Victoria-bronselectie bevatte alleen Victoria-records. De nieuwe Australia-weergave combineert de rechtstreeks gekoppelde bronnen en kan meldingen over deelstaatgrenzen tonen; het gekozen afstandsfilter blijft van toepassing.

Er was ook een echte fout in onze incidentidentiteit. Eén CAD-incident, bijvoorbeeld `ESTA:260910033`, kwam eerst van VIC/ESTA en later van VIC/CFA. Omdat de afzender onderdeel van onze sleutel was, bleef de eerdere versie als een tweede incident staan. Hetzelfde gebeurde bij de SES-overname in Yea. Nu wordt bij Victoria CAD-incidenten de gedeelde ESTA-identiteit gebruikt. Bestaande dubbelen worden transactioneel samengevoegd met behoud van de eerste waarneming, vroegste bekende meldtijd, laatste waarneming en nieuwste brongegevens. We voegen geen verschillende meldingen samen op basis van alleen straatnaam of nabijheid.

## Uitbreiding

- Naam in App Store Connect en op het toestel: **Dispatch Australia**. Bundle-ID, bestaande installatie, opgeslagen voorkeuren en TestFlight-app blijven dezelfde.
- Nieuwe officiële bronnen: NSW Rural Fire Service, Queensland Fire Department en SA Country Fire Service, naast Victoria en ACT.
- Een gecombineerd Australia-overzicht en afzonderlijke regiokeuzes, met plaatsen in NSW en Queensland.
- Nieuwe installaties beginnen bij Australia. Bestaande gebiedskeuzes blijven behouden. Use my location zoekt voortaan binnen alle ondersteunde regio's.
- De lijst vermeldt aantallen actuele en eerder geziene incidenten en maakt de ingestelde afstand expliciet. Waarschuwingen kunnen in hetzelfde tabblad worden opengeklapt.
- Queensland-tijden volgen Brisbane (geen zomertijd); de gezamenlijke weergave gebruikt expliciet Sydney-tijd. Onbekende oproeptijden worden niet verzonnen. De bronupdate bepaalt dan de volgorde, met het label Updated. Alleen wanneer ook die ontbreekt wordt de eerste waarneming gebruikt, met Seen. Daardoor schuiven langlopende branden niet naar boven bij het aansluiten van een bron.
- Iedere melding linkt naar haar eigen officiële bron. De gezamenlijke bronstatus wordt als vertraagd gemarkeerd als een aangesloten bron ontbreekt of te oud is.

## Bronnen en grenzen

[NSW RFS](https://www.rfs.nsw.gov.au/news-and-media/stay-up-to-date/feeds) publiceert GeoJSON en staat hergebruik toe onder CC BY 4.0, met voorgeschreven bronvermelding. De documentatie noemt een actualisering per 30 minuten. Incidenten hebben een stabiel numeriek bron-ID. De datum in de beschrijving is een update en wordt als lokale NSW-tijd gelezen, niet als oproeptijd. Advice staat bij de incidentstatus; verhoogde waarschuwingsniveaus krijgen ook een waarschuwing. Geometrie van brandincidenten wordt niet voorgesteld als officiële waarschuwingszone.

De [Queensland-dataset](https://www.data.qld.gov.au/dataset/queensland-fire-and-rescue-current-bushfire-incidents) is CC BY 4.0 en noemt vegetatiebranden, toegestane branden en actualisering per 30 minuten. De JSON bevat daarnaast officiële waarschuwingsrecords. Verlopen waarschuwingen worden weggelaten, waarschuwingspolygonen blijven polygonen en krijgen geen verzonnen middelpunt. Het veld met vervaltijd wordt niet gebruikt om gewone incidenten die QFD nog publiceert stilzwijgend te verwijderen.

De eerste controle van de nieuwe adapters bevatte 56 NSW-incidenten, waaronder 23 geplande activiteiten, en 46 Queensland-incidenten plus zes waarschuwingen. Dit zijn bronmomentopnamen, geen aantallen nieuwe uitrukken per dag. Waarschuwingen kunnen hetzelfde voorval beschrijven als een incident en worden niet opgeteld om unieke incidenten te claimen.

Deze release dekt **VIC, ACT, NSW, QLD en SA**, niet alle Australische hulpdienstoproepen. NSW en Queensland zijn vooral brandenbronnen; ze zijn geen volledige stedelijke politie-, ambulance- en brandweeralarmering. CFSScan, WA, Tasmania en NT blijven buiten de collector totdat geschikte toegang en hergebruik zijn bevestigd. Victoria-verkeersincidenten vereisen nog een Transport Victoria API-sleutel. Er zijn geen leveranciers aangeschreven of betaalde databronnen aangeschaft.

Native app en de afzonderlijke Railway-feedservice worden bijgewerkt. De eerdere Sites-webpreview is in deze release niet omgebouwd tot de landelijke app. Pushmeldingen en abonnementen blijven buiten deze testrelease.


## Aanvullende South Australia-verificatie

De officiële [CFS copyrightpagina](https://www.cfs.sa.gov.au/home/copyright/) noemt CC BY 4.0 en een concrete attributievorm. De op de [CFS-feedpagina](https://www.cfs.sa.gov.au/warnings-restrictions/warnings/rss-feeds/) gepubliceerde incidenten-RSS is daarom aangesloten met bron- en datumvermelding. De feed bevat identifiers, categorie, plaats, status, First Reported en pubDate, maar geen coördinaten. De eerste controle bevatte vijf records, waaronder drie geplande activiteiten en een Tree Fire van MFS via CFS. Dit bewijst geen volledige MFS-dekking.

South Australia is expliciet een lijstbron: records verschijnen bij All South Australia of All Australia zonder afstandsfilter. Er worden geen coördinaten afgeleid uit een straatnaam. De kaart legt deze beperking uit. First Reported wordt in Australia/Adelaide geïnterpreteerd, inclusief het halve uur tijdverschil en zomertijd. Dit verandert niets aan de afzonderlijke gebruiksvoorwaarden van CFSScan, dat niet is aangesloten.

## Controle van de geleverde dekking

Op 11 september 2026 om 16:44 UTC stonden zeven incidentrecords in de officiële VicEmergency GeoJSON, inclusief twee geplande branden en Caldwell in NSW. Alle zeven kwamen terug in onze gecombineerde API; er ontbrak in die vergelijking geen record. De opgeslagen Victoria-bronidentiteiten waren uniek. Alle vijf aangesloten bronnen waren beschikbaar en vers. Dit blijft een momentopname van openbare bronnen, geen belofte dat alle 000-oproepen beschikbaar zijn.

De zelfstandige iPhone Release-build is koud gestart en visueel gecontroleerd. De landelijke lijst toont onder andere Horsham, Caldwell, NSW-incidenten, ACT-ambulance en SA CFS. South Australia toont de eigen lokale tijd en vermeldt dat kaartcoördinaten ontbreken. De iOS- en Android-productiebundels, 15 backendtests en zes mobiele tests zijn geslaagd. Details en distributiestatus staan in `../mobile/VERIFICATION.md` en `../mobile/release/README.md`.
