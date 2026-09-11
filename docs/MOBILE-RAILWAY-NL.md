# Mobiele eerste opzet en Railway

11 september 2026.

## Wat er nu staat

De native app staat in `mobile/` binnen `chrisschepers/dispatch-au`. Eén Expo/React Native-codebasis levert iOS- en Android-bundels. De eerste versie haalt de publieke Victoria-feed rechtstreeks op, verwerkt die met dezelfde parser als de website en bewaart alleen lokale voorkeuren en één plaats op het toestel. De webpreview blijft op Sites draaien.

Railway is voor deze eerste persoonlijke preview niet nodig. De Railway-CLI is aangemeld en de beschikbare projecten zijn gecontroleerd. Er bestaat een afzonderlijk project P2000 Alarm met een backend en Postgres, maar er is geen Dispatch-project of Dispatch-koppeling aangetroffen. Er zijn geen Railway-diensten gewijzigd of toegevoegd.

## Wat Railway later kan verzorgen

Voor meerdere gebruikers, accountsynchronisatie, historie en achtergrondpush is een gedeelde backend logisch. Maak daarvoor een afzonderlijk Dispatch-project; het bestaande Nederlandse P2000-project heeft zijn eigen bron, gebruikers en productieomgeving.

| Onderdeel              | Functie                                                                                                   | Wanneer nodig                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Dispatch API           | Gevalideerde incidenten, locaties en abonnementsrechten leveren aan web en mobiel                         | Publieke consumentenpilot en synchronisatie          |
| Postgres               | Incidentstatus/historie, gebruikers, plaatsen, pushabonnementen en aankooppogingen                        | Zodra historie of gedeelde accounts wordt aangeboden |
| Eén continue collector | Bron volgens afgesproken pollingvoorwaarden ophalen, verschillen herkennen en dubbele meldingen voorkomen | Achtergrondpush en betrouwbare historie              |
| Verzendworker / queue  | Expo Push/APNs/FCM verzenden, receipts verwerken, ongeldige tokens verwijderen en herhalen                | Als echte push beschikbaar komt                      |

Railway ondersteunt langlopende services, geplande jobs en HTTP-healthchecks. Voor een collector die iedere minuut moet controleren past een langlopende worker beter dan een timer in de telefoon. Configureer `PORT`, een `/health`-endpoint, gecontroleerde herstarts en logging. Een succesvolle deployment-healthcheck bewijst alleen dat de service opstart; monitor ook de leeftijd van de laatste bronupdate en fouten in de verzendqueue. [Railway services](https://docs.railway.com/services), [healthchecks](https://docs.railway.com/deployments/healthchecks)

Schaal pas nadat het bronvolume, de toegestane pollingfrequentie en bewaartermijn duidelijk zijn. De collector hoort actief te blijven als er geen bezoekers zijn; laat een slaapstand daarom niet ongemerkt de pushfunctie stilzetten. D1- en ChatGPT-identiteit uit Sites kunnen niet ongewijzigd naar een Node/Postgres-backend worden gekopieerd. Ontwerp een versieerbaar API-contract en gebruik geverifieerde mobiele tokens, geen door de client aangeleverde identiteitsheaders.

## Wat eerst nodig is voor distributie

1. Een eigen Expo/EAS-project en Apple-/Google-appregistraties met de gekozen app-identifiers.
2. Signing voor testdistributie en store-builds. Voor Android Maps ook een beperkte Google Maps-clientkey voor package plus certificaat.
3. Tests op echte iPhones en Android-toestellen: lijst, kaart, offline/herstel, permissies, toegankelijkheid en delen.
4. Voor Pro: StoreKit/Google Play Billing, aankoopherstel en gedeelde serverrechten, bijvoorbeeld via RevenueCat. De bestaande Stripe-flow blijft een webflow; mobiele producten krijgen hun eigen gecontroleerde aankooproute. De eerste opzet toont alleen de geplande Pro-functionaliteit. [Expo IAP](https://docs.expo.dev/guides/in-app-purchases/)
5. Bevestigde commerciële gebruiksvoorwaarden van de samengestelde Victoria-feed voordat een publieke betaalde dienst wordt gelanceerd.

Er zijn in deze stap geen nieuwe infrastructuurkosten, live aankopen of store-publicaties gestart. Railway is dus een vervolgstap voor centrale verwerking en push; het is geen voorwaarde om de eerste native interface te ontwikkelen en persoonlijk te testen.
