# CFSScan en meer meldingen in Dispatch

Onderzocht op 11 september 2026. Dit is een vervolg op het landelijke marktonderzoek. De aantallen hieronder zijn momentopnamen, geen dagvolumes of downloads.

## Wat CFSScan anders doet

[CFSScan](https://www.cfsscan.com/) monitort het FLEX-pagernetwerk in South Australia. Het is een onafhankelijke dienst, geen overheidsapp. De [monitoring-uitleg](https://www.cfsscan.com/monitoring) beschrijft de ontvangst van pagerberichten; de [Australische App Store-pagina](https://apps.apple.com/au/app/cfsscan/id1107585269) biedt de iPhone-app aan.

De [openbare livefeed](https://www.cfsscan.com/livefeed) liet tijdens de controle veel ambulancegerelateerde berichten, operationele communicatie en meerdere berichten bij dezelfde inzet zien. Het volume aan pagerberichten is dus niet gelijk aan het aantal unieke incidenten. Medische details en adressen uit deze pagina zijn niet overgenomen in dit rapport of in Dispatch.

De [voorwaarden](https://www.cfsscan.com/legal/terms-privacy), bijgewerkt april 2026, vereisen schriftelijke toestemming voor herpublicatie en geautomatiseerd API-gebruik. Ze verbieden ongeautoriseerd bulk verzamelen, scrapen en spiegelen. Er is daarom geen scraper of CFSScan-integratie gebouwd. Een datapartnerschap met expliciete afspraken over commerciële herpublicatie, abonnementen, beschikbaarheid en persoonsgegevens is een mogelijke vervolgstap. Er is geen bericht aan CFSScan verzonden.

## Wat daadwerkelijk meer inhoud oplevert

1. **Eigen historie.** Dispatch toonde alleen wat op dat moment in de actuele Victoria-feed stond. Een server verzamelt nu periodiek unieke incidenten en bewaart de laatst bekende gegevens. De app kan actuele en eerder geziene incidenten over 24 uur, drie dagen of zeven dagen tonen. Eerdere meldingen houden hun laatst gerapporteerde status, met een duidelijk historisch label. Verdwijnen uit een bron betekent niet dat een incident is opgelost. De kaart bevat uitsluitend nog vermelde incidenten; oude waarschuwingen worden niet als actueel getoond.
2. **Canberra/ACT als aparte regio.** De [ACT ESA incidentfeed](https://esa.act.gov.au/feeds/currentincidents.xml) bevat ook ambulance-uitrukken. De [officiële documentatie](https://data.esa.act.gov.au/be-emergency-ready/warnings-alerts) noemt updates per 60 seconden vanuit het meldkamersysteem en CC BY 4.0. Tijdens een directe controle om ongeveer 15:06 UTC stonden er 15 incidenten, waarvan 13 ambulance-uitrukken en twee geplande activiteiten. Victoria had toen 14 gewone incidenten inclusief twee geplande activiteiten. Dit zijn bronmomentopnamen; ze zeggen niets over aantallen nieuwe incidenten per dag.
3. **Verkeersincidenten voor Victoria als volgende bron.** [Unplanned disruptions – Road](https://opendata.transport.vic.gov.au/dataset/unplanned-disruptions-road) bevat onder meer botsingen, onverwachte afsluitingen, brand, overstroming en objecten op de weg. De officiële dataset vermeldt CC BY 4.0, een verversing van 60 seconden en maximaal twintig verzoeken per minuut. Toegang vereist registratie en een `KeyID` via het Transport Victoria-portaal. Deze bron is nog niet geïntegreerd. Bij implementatie moeten deeltrajecten onder één hoofdincident vallen en overlap met VicEmergency worden herkend.

## Reikwijdte van de huidige uitbreiding

De native app behoudt Nearby, Map en Settings. Victoria blijft de standaard; bestaande locatievoorkeuren blijven behouden. Via de locatiesheet kan Canberra/ACT worden gekozen. ACT krijgt een ambulancefilter. Er worden geen willekeurige nieuwsberichten toegevoegd om aantallen op te blazen.

De nieuwe afzonderlijke Railway-service gebruikt een persistent volume. Historie ontstaat pas vanaf de eerste succesvolle verzameling: we halen geen zeven dagen verleden terug. Bij bronproblemen blijven de laatst geldige gegevens staan met een melding dat ze verouderd zijn. De service slaat geen gebruikerslocaties, accounts of patiëntbeschrijvingen op. ACT-ambulancemeldingen tonen de openbare suburb en broncoördinaten, zonder de vrije medische beschrijving.

De ACT-incidentfeed bevat geen volledige waarschuwingendienst. In de app staat daarom een verwijzing naar ESA voor officiële waarschuwingen. Victoria's bestaande feed en waarschuwingen blijven aanwezig. De commerciële gebruiksvoorwaarden van de gecombineerde Victoria-feed moeten nog rechtstreeks bij de bron worden bevestigd voordat een betaalde publieke dienst wordt gelanceerd; de bestaande persoonlijke testfase blijft van toepassing. Pushmeldingen en abonnementen zijn in deze uitbreiding niet aangezet.

## Productkeuze

De grootste directe winst voor Melbourne is historie: een melding blijft vindbaar nadat de actuele bron hem verwijdert. ACT verbreedt het geografische bereik en laat een officiële feed met ambulance-uitrukken zien, maar maakt de directe omgeving van een Melbourne-gebruiker niet drukker. Daarvoor heeft de Victoria-verkeersbron meer potentieel. CFSScan kan South Australia toevoegen als een overeenkomst beschikbaar komt; de pagerfeed mag niet als een vrij herbruikbare API worden behandeld.

Een nieuwe directe ontwerpconcurrent is [Ember](https://apps.apple.com/au/app/ember/id6757624166), met een native kaart en Victoria-incidenten. Dispatch moet zich onderscheiden door een rustige buurtlijst, bruikbare historie en relevante regionale bronnen. Alleen een grotere teller is geen bewijs van productwaarde of betalingsbereidheid.

## Opgeleverd

De verzamelservice draait op Railway met persistente opslag. De eerste verzameling was op 11 september om 15:19 UTC. Na meerdere deployments bleven die starttijd en de historische meldingen behouden; beide bronnen zijn vers gecontroleerd. Om circa 15:28 UTC stonden 13 Victoria-incidenten (waarvan drie eerder vermeld) en 15 ACT-incidenten (waarvan één eerder vermeld) in de opgebouwde historie. Deze broncijfers bevatten geplande activiteiten die standaard verborgen zijn.

Native versie **0.1.3 (4)** is beschikbaar in de bestaande TestFlight-groep van de eigenaar. Apple meldt `VALID` en `IN_BETA_TESTING`. De drie tabbladen, ACT-bron, ambulancefilter, kaart en bewaarde regio/historie-instelling zijn in de zelfstandige iPhone Release-app gecontroleerd. Androidbundels compileren; een Android Store-release is niet uitgevoerd. De Sites-webpreview is in deze stap niet aangepast.
