# Android: Emergencies Near Me op Google Play

20 oktober 2026. Pakket `com.chrisschepers.dispatchau`, zelfde code als iOS. Bouwen gaat via `.github/workflows/android.yml` (Linux-runner, geen EAS), net als bij 112 Meldingen.

## Wat de code al doet

- **Push**: de app stuurt het eigen FCM-token; de backend verstuurt rechtstreeks via FCM v1 (`backend/push.mjs`, `sendFcm`). Kanalen `dispatch_snd_<geluid>` met hoge prioriteit.
- **Betalen**: RevenueCat met Google Play, zelfde entitlement `premium` als iOS. De proefperiode komt uit het Play-aanbod; Play biedt hem alleen aan wie er recht op heeft.
- **Betaalmuur**: link naar `https://emergenciesnearme.online/terms` (Play heeft geen standaard-EULA) en `/privacy`.
- **Label** op het beginscherm: "Emergencies".
- **Rechten**: alleen locatie (tijdens gebruik) en meldingen. Geblokkeerd: achtergrondlocatie, foreground service, microfoon, overlay, opslag, advertentie-ID.
- **Buiten Australië**: toont Melbourne, zodat testers in Nederland meteen incidenten zien.

## Nog te regelen (eenmalig)

1. **Firebase**: in project `p2000alert-38d3c` een Android-app toevoegen met pakket `com.chrisschepers.dispatchau`, `google-services.json` downloaden naar `mobile/` en committen. Een servicesleutel met de rol *Firebase Cloud Messaging API Admin* als Railway-variabele `FCM_SERVICE_ACCOUNT` (JSON of base64).
2. **Google Maps**: een sleutel voor *Maps SDK for Android*, beperkt tot `com.chrisschepers.dispatchau` met de SHA-1 van de app-ondertekeningssleutel (Play Console → App-integriteit). GitHub-secret `GOOGLE_MAPS_ANDROID_API_KEY`.
3. **Uploadsleutel**: GitHub-secrets `DISPATCH_KEYSTORE_B64`, `DISPATCH_KEYSTORE_PASSWORD`, `DISPATCH_KEY_ALIAS`, `DISPATCH_KEY_PASSWORD`. Kwijt? Play App Signing laat je de uploadsleutel resetten.
4. **Play Console**: nieuwe app "Emergencies Near Me", gratis met in-app-aankopen. De **eerste** .aab handmatig uploaden (interne test); daarna doet de workflow het, met secret `PLAY_SERVICE_ACCOUNT_JSON` (hetzelfde uploadaccount als 112 Meldingen, met rechten op deze app).
5. **Abonnement** in de Play Console: product `premium_year`, basisplan jaarlijks A$9,99, aanbod 3 dagen gratis. In RevenueCat koppelen aan entitlement `premium`, offering `default`, pakket Annual. Publieke `goog_`-sleutel in `mobile/src/aankopen.ts`.
6. **Gesloten test**: minimaal 12 testers, 14 dagen onafgebroken, daarna productietoegang aanvragen. De testers van 112 Meldingen kunnen opnieuw (zelfde Google-groep).

## Stand van de builds (26-10)

Build 1 en 2 (0.2.0) zijn gebouwd zonder `GOOGLE_MAPS_ANDROID_API_KEY` en zonder `mobile/google-services.json`. De repo heeft alleen de vier `DISPATCH_KEY*`-secrets. Gevolg: geen push, en de Google-kaart heeft geen sleutel (de kaart en het kaartje bij een melding). Regel stap 1 en 2 hierboven vóór de volgende build die testers krijgen. Zonder `PLAY_SERVICE_ACCOUNT_JSON` moet de .aab met de hand naar de Play Console.

## Winkelvermelding

- **Naam**: Emergencies Near Me
- **Korte beschrijving** (max 80): Live bushfire, flood and crash alerts near you, across Australia.
- **Volledige beschrijving**: `mobile/store/play/beschrijving-en-AU.txt` (de enige taal is en-AU). Op 26-10 afgewezen onder Misleading Claims ("Missing Source Link for Government Information"). Sindsdien staat bovenaan "Not a government app", en noemt het kopje *Sources* per staat de dienst met de .gov.au-link. Zie de tabel in `docs/APP-REVIEW.md`.
- **Categorie**: Nieuws en tijdschriften (besluit Chris 26-10: blijft Nieuws, dus bronvermelding overal). Contact: chrisschepers22@gmail.com, website `https://emergenciesnearme.online`.
- **Banner**: `mobile/store/play/feature-graphic-1024x500.png` (`banner.py`).
- **Screenshots**: nog maken op een Android-emulator in CI, zodra de Maps-sleutel er is (de iPhone-beelden tonen Apple Maps en horen niet op Play).

## Gegevensbeveiliging (Data safety)

- Gegevens verzameld: **ja**. Gedeeld met derden: **nee**. Versleuteld onderweg: **ja**. Verwijderen op verzoek: **ja** (via e-mail).
- **Locatie → precieze locatie**: verzameld, niet gedeeld, verplicht voor meldingen in de buurt; doel *app-functionaliteit*.
- **Apparaat- of andere ID's**: verzameld (installatie-ID en pushtoken); doel *app-functionaliteit*.
- **Financiële info → aankoopgeschiedenis**: verzameld via Google Play/RevenueCat; doel *app-functionaliteit*.
- Geen advertenties, geen analytics, geen account.

## Inhoudsclassificatie en doelgroep

- Vragenlijst: geen geweld, seks, drugs, gokken; geen gebruikersinhoud; geen locatiedeling met anderen. Verwachte uitkomst: PEGI 3 / Iedereen.
- Doelgroep: 18+ (geen kinderapp), geen advertenties.
- Overheidsapp: **nee**. In de beschrijving staat dat de app onafhankelijk is.
- Nieuws- en tijdschrift-apps: **ja**, ingevuld op 24-10. Juridische entiteit Chris Schepers, contact-URL `/support`, commercieel, **aggregator: ja**. Een aggregator moet per bericht de bron tonen: dat doet het meldingscherm ("Source: VicEmergency" en het domein bij de link).
