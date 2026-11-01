# Play-teksten (en-AU)

- **`beschrijving-en-AU.txt`** is de tekst die nu live staat in de Play Console (gesloten test). Niet aanpassen zolang hij daar zo staat: dit bestand moet gelijk blijven aan de Console.
- **`beschrijving-en-AU-productie.txt`** is de tekst voor de productieaanvraag, zolang Android nog geen push en geen betaalmuur heeft. Bovenaan staat de korte beschrijving (max 80 tekens, de regel na `Short description: `), daaronder de volledige beschrijving (max 4000 tekens).

## Wanneer welke tekst

1. **Bij de productieaanvraag** (op zijn vroegst ±11/12-11): de korte en de volledige beschrijving uit het productiebestand plakken, tegelijk met de aanvraag en in dezelfde inzending. Niet eerder los opslaan en indienen: dan gaat de winkelvermelding apart ter beoordeling en gaat de beoordeling van de gesloten test opnieuw open.
2. **Zodra push én de Android-betaalmuur live staan** (google-services.json + `FCM_SERVICE_ACCOUNT`, en de Google Play-sleutel in `mobile/src/aankopen.ts` met de testcode voor reviewers): terug naar de volledige tekst met meldingen en het abonnement, en dit bestand daarop bijwerken.

Waarom: Google wijst een vermelding af die iets belooft wat de build niet doet (Misleading Claims). De Android-build zegt nu zelf "Alerts are coming soon" (`InstellingenScreen.tsx`) en heeft zonder RevenueCat-sleutel geen aankoop.

Elke functie in een tekst moet in de Android-build op main zitten. Lengtes tellen met node, bijvoorbeeld:

```sh
node -e "const t=require('fs').readFileSync('mobile/store/play/beschrijving-en-AU-productie.txt','utf8');const [k,,...r]=t.split('\n');console.log(k.replace('Short description: ','').length, r.join('\n').trim().length)"
```
