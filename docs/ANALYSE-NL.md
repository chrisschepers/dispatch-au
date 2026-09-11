# Dispatch: Victoria als eerste markt

Onderzocht op 11 september 2026. Werknaam: Dispatch. Eerste product: Engelstalige, installeerbare webapp. Daarna iOS en Android. De gebruiker heeft Victoria bevestigd; South Australia is geen vervangende startmarkt.

## Besluit

Bouw een rustige, lokale incidentenapp op de openbare VicEmergency Events-feed. De kans ligt in gemak voor buurtbewoners: wat gebeurt er, waar, wanneer en wat is de gemelde status? Het product is een openbare incidententijdlijn, geen volledige Australische P2000-kopie. Gebruik dezelfde visuele principes als de eigen app 112 Meldingen, met Australische inhoud en terminologie.

De techniek is aantoonbaar haalbaar. Een brede commerciële licentie voor alle gegevens in de samengestelde feed is nog niet voldoende onderbouwd. De betaalfunctie is daarom voorbereid maar standaard uitgeschakeld. Dat blokkeert het bouwen, testen en persoonlijk bekijken niet.

## Wat het eerdere onderzoek oplevert

Het gesprek “Landen met P2000” van 2 september 2026 beschrijft Victoria, het Emergency Alerting System en drie endpoints: events-geojson.json, impact-areas-geojson.json en osom-delta.json. De technische conclusie blijft overeind: reguliere meldkamerincidenten komen in de openbare feed voor.

Een correctie is nodig: de eerdere uitleg noemde een Postman-collectie “officiële API-documentatie” en behandelde een CC BY-licentie als vastgesteld voor de volledige feed. De collectie is geen afdoende verklaring van de rechthebbende. Open bereikbaarheid bewijst evenmin toestemming voor iedere vorm van commercieel hergebruik.

## Praktijktest van de bron

De directe [Events-feed](https://emergency.vic.gov.au/public/events-geojson.json) gaf zonder API-sleutel een geldige GeoJSON FeatureCollection terug. De gecontroleerde momentopname had 14 objecten, inclusief een NSW-object dat buiten de gekozen Victoria-scope valt. Aanwezig waren gebouwbranden, een voertuig-in-gebouw-redding, een natuurbrand, overstroming, gebouwschade, omgevallen boom, geplande branden en een officiële Advice-waarschuwing. Dit is een momentopname, geen schatting van dagelijks volume.

Bruikbaar zijn publieke referenties, categorie, status, locatie, bronorganisatie, aantallen resources, aanmaak- en wijzigingstijden en geometrie. Ontbrekende waarden moeten onbekend blijven. `resources: 0` is iets anders dan een ontbrekend resources-veld. Een resource is geen door ons geïdentificeerd voertuig.

IDs zijn soms cijfers en soms tekst. Tijden bevatten zowel UTC als lokale tijd met offset. Waarschuwingen kunnen GeometryCollections en polygonen bevatten; een willekeurig middelpunt zou een misleidende incidentlocatie opleveren. Oudere geplande branden kunnen nog in een actueel bronbestand staan. Een verse download maakt die incidenten niet nieuw.

De feed vormt geen volledige politie- of ambulancealarmering. Capcodes, stations, voertuigidentiteiten en volledige ruwe pagertekst mogen niet uit de Nederlandse app worden overgenomen alsof Victoria ze ook aanlevert. De officiële website legt het onderscheid tussen locaties, impactgebieden en waarschuwingen uit. [VicEmergency](https://emergency.vic.gov.au/respond/)

## Bronkeuze en gebruiksvoorwaarden

| Bron                        | Beoordeling voor de start                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| VicEmergency Events GeoJSON | Hoofdbron voor de persoonlijke preview; alle licentievoorwaarden voor commerciële publicatie moeten nog expliciet worden bevestigd. |
| Impact Areas                | Latere uitbreiding; impactgebied is iets anders dan waarschuwingsgebied.                                                            |
| OSOM Delta                  | Niet nodig voor de start; onvoldoende contract/documentatie om er beschikbaarheid van afhankelijk te maken.                         |
| CFA RSS/JSON                | Interessant, maar voorwaarden zijn niet uniform weergegeven.                                                                        |
| Ruwe EAS-pagers             | Niet nodig voor deze versie; geen afhankelijkheid van lokale radioapparatuur of onderschepte medische berichten.                    |
| NSW RFS                     | Mogelijke latere deelstaat. Geen stilzwijgende vervanging van Victoria.                                                             |

[DataVic](https://discover.data.vic.gov.au/dataset/cfa-data-feeds-for-incidents-total-fire-bans-fire-danger-ratings-and-latest-news) noemt CC BY 4.0 voor de CFA-dataset en beschrijft minuutupdates. De [CFA-feedpagina](https://www.cfa.vic.gov.au/rss-feeds) bevat ook een beperking tot persoonlijk, niet-commercieel gebruik en verwijst ontwikkelaars naar EMV. [EMV Copyright](https://www.emv.vic.gov.au/copyright) vraagt voor gebruik buiten de genoemde uitzonderingen schriftelijke toestemming. Die algemene websitevoorwaarden beslissen niet noodzakelijk over iedere afzonderlijke dataset, maar rechtvaardigen ook geen onbeperkte licentieclaim voor de samengestelde Events-feed.

Actie voor een commerciële lancering: laat EMV schriftelijk bevestigen dat de directe gecombineerde Events-feed, inclusief CFA, SES, DEECA en waarschuwingen, in een freemium app mag worden weergegeven, opgeslagen en gebruikt voor pushmeldingen. Leg vereiste attributie, ongewijzigde waarschuwingstekst, polling, bewaartermijn en derdepartijkanalen vast. Er zijn geen berichten namens de gebruiker verstuurd.

## Markt en onderscheid

VicEmergency is zowel de bron als een directe gratis concurrent. Een algemene veiligheidsapp met alleen kaart en waarschuwingen heeft daarom weinig onderscheid. Dispatch moet winnen op een overzichtelijke tijdlijn van gewone incidenten, snel kiezen van een lokale omgeving en een consistente mobiele bediening. Claims als “sneller dan VicEmergency” zijn ongegrond zonder meting.

Doelgroep: lokaal betrokken bewoners, familieleden die meerdere woonplaatsen willen volgen en geïnteresseerden in brandweer/SES-activiteiten. Officiële veiligheidswaarschuwingen blijven toegankelijk. Een betaalmuur rond basiswaarschuwingen is geen gekozen verdienmodel.

De haalbaarheid van abonnementen is een hypothese. Meet in een pilot herhaalgebruik, aantal ingestelde plaatsen, behoefte aan meldingen en daadwerkelijke betaalconversie; downloads en positieve opmerkingen zijn geen vervanging voor die cijfers.

## Ontwerp, gebaseerd op de eigen 112 Meldingen-app

De lokale broncode van `meldingen112/src/theme.ts` en `screens/BuurtScreen.tsx` is bestudeerd. De bruikbare principes zijn de iOS-achtige lichtgrijze ondergrond, gegroepeerde witte kaarten, dunne scheidingslijnen, warm rood accent, een gekleurde rand en een functioneel icoon per categorie. Een titel in gewone taal staat boven locatie en status; de tijd staat consequent rechts. De webapp gebruikt systeemlettertypen en behoudt een donkere variant.

De desktop krijgt ruimte voor opgeslagen plaatsen en een bescheiden Pro-kaart. Mobiel blijft de incidentenlijst de hoofdzaak, met vaste bediening voor lijst, kaart, plaatsen en instellingen. Geen marketingpagina vóór de feed. Geen ambulance- en politiefilters zonder bijbehorende data. Warnings zijn afzonderlijk herkenbaar en blijven zichtbaar bij incidentfilters.

## Abonnementshypothese

Voorstel: A$4.99 per maand of A$39.99 per jaar, nog niet te koop. Jaarlijks is circa 33% goedkoper dan twaalf maandbetalingen. Dit zijn gekozen testprijzen, geen marktonderzoek naar bewezen betalingsbereidheid.

Gratis: actuele feed, kaart, zoeken, typefilters en één opgeslagen plaats na aanmelden. Pro: maximaal vijf opgeslagen plaatsen met een eigen straal. De preview heeft geen advertenties. Historie, per-type notificatieregels en push zijn mogelijke latere uitbreidingen; er wordt niet gedaan alsof die nu al geleverd worden.

De implementatie gebruikt Stripe Checkout en het klantenportaal. Abonnementsrechten worden op de server opgeslagen op basis van ondertekende webhooks; terugkomen op een success-URL geeft geen Pro. Maand/jaar-prijs, valuta en interval worden gecontroleerd. Een gebruiker kan via het portaal opzeggen. Live betaaltests en configuratie ontbreken nog.

## Betrouwbaarheid en architectuur

Frontend: React/TypeScript, mobiel bruikbare webapp en PWA-manifest. Backend: HTTP-routes in een Cloudflare Worker, D1 voor broncache, opgeslagen plaatsen en abonnementsstatus. Sites verzorgt de persoonlijke preview. GitHub bevat de nieuwe zelfstandige codebasis.

Een gedeelde cache voorkomt een externe bronaanvraag voor elke bezoeker. Een fout overschrijft de laatste goede snapshot niet. De app toont zowel bronmoment als ontvangstmoment; na vijf minuten zonder verse gegevens verdwijnt de live-status. Incidenttijden worden altijd in Australia/Melbourne getoond. Waarschuwingsinhoud wordt niet als ruwe HTML geïnjecteerd; niet-benodigde interne contactvelden verlaten de parser niet.

De huidige cache wordt vernieuwd door bezoekersaanvragen. Het is geen continue collector en er wordt geen volledige historie beloofd. Voor achtergrondpush is een afzonderlijke altijd-actieve collector plus een verzendqueue en Web Push/APNs/FCM nodig. Geen browser-timer of GitHub Actions-cron als garantie voor snelle alarmbezorging.

De kaart gebruikt Leaflet en OpenStreetMap voor gewone interactieve weergave, met attributie en zonder offline tegeldownloads. Voor groei of een betaalde beschikbaarheidsbelofte is een kaartprovidercontract verstandig; communitytiles hebben geen SLA. [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/)

## GitHub en kosten

De openbare repository is `chrisschepers/dispatch-au`. [GitHub](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job) bevestigt dat standaard gehoste runners voor publieke repositories gratis en onbeperkt te gebruiken zijn. Dat maakt hosting, opslag, grotere runners en externe betaal- of kaartdiensten niet gratis. De CI gebruikt een standaard Ubuntu-runner en bouwt/test de app; geen geheimen zijn nodig voor pull-requestchecks.

Openbaar betekent hier leesbare broncode; er is niet automatisch een ruime open-sourcelicentie toegekend. De projectnaam en definitieve branding zijn werkkeuzes, geen gecontroleerde merkregistratie.

## Wat nog nodig is voor verkoop

1. Bevestigde commerciële voorwaarden voor alle gebruikte bronfeeds.
2. Stripe-account, AUD-prijzen, webhooksecret en geteste aankoop/opzegging.
3. Publieke consumentenaanmelding en een eigen domein; de huidige preview gebruikt ChatGPT-aanmelding.
4. Browser- en toesteltests op iPhone Safari en Android Chrome, inclusief installatie, toegankelijkheid en terugkeer uit checkout.
5. Voor de beloofde push-uitbreiding: continue collector, dubbele-meldingencontrole, verzendqueue, consent en storingsmonitoring.
6. Een pilot met echte Victoria-gebruikers voordat native apps en acquisitie worden opgeschaald.

Er wordt dus een werkende eerste webversie opgeleverd, geen als voltooid vermomde commerciële lancering.
