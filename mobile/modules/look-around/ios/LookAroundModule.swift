import ExpoModulesCore
import MapKit

/// Apple Look Around voor 112 Meldingen (wens Chris 27-09): het straatbeeld op
/// iOS komt van Apple Kaarten, zodat de Google-daglimiet voor Android blijft.
///
/// - `snapshot`: een stilstaand plaatje van de plek, als bestand in de cache.
///   Geeft nil als Apple daar geen straatbeeld heeft; de app valt dan terug op
///   Google via de backend.
/// - `open`: het panorama zelf, schermvullend, waarin je kunt rondkijken.
///
/// Alles loopt via MapKit op het toestel: geen sleutel, geen server.
public class LookAroundModule: Module {
  /// Scènes per plek, zodat `open` na een snapshot niet opnieuw hoeft te zoeken.
  private var scenes: [String: MKLookAroundScene] = [:]
  /// Plekken waar Apple niets heeft; niet elke keer opnieuw vragen.
  private var geen: Set<String> = []

  public func definition() -> ModuleDefinition {
    Name("LookAround")

    AsyncFunction("snapshot") { (lat: Double, lon: Double, breedte: Double, hoogte: Double) async throws -> String? in
      let k = Self.sleutel(lat, lon)
      let bestand = Self.cacheMap().appendingPathComponent("\(k)-\(Int(breedte))x\(Int(hoogte)).jpg")
      // Een straatbeeld verandert niet per dag; een week bewaren is ruim.
      if let attr = try? FileManager.default.attributesOfItem(atPath: bestand.path),
         let datum = attr[.modificationDate] as? Date,
         Date().timeIntervalSince(datum) < 7 * 24 * 3600 {
        return bestand.absoluteString
      }
      guard let scene = try await self.scene(lat, lon) else { return nil }

      let opties = MKLookAroundSnapshotter.Options()
      opties.size = CGSize(width: breedte, height: hoogte)
      opties.pointOfInterestFilter = .excludingAll
      let snapshot = try await MKLookAroundSnapshotter(scene: scene, options: opties).snapshot
      guard let data = snapshot.image.jpegData(compressionQuality: 0.8) else { return nil }
      try data.write(to: bestand, options: .atomic)
      return bestand.absoluteString
    }

    AsyncFunction("open") { (lat: Double, lon: Double) async throws -> Bool in
      guard let scene = try await self.scene(lat, lon) else { return false }
      return await MainActor.run { () -> Bool in
        guard let boven = self.appContext?.utilities?.currentViewController() else { return false }
        let vc = MKLookAroundViewController(scene: scene)
        vc.isNavigationEnabled = true
        vc.showsRoadLabels = true
        vc.pointOfInterestFilter = .excludingAll
        vc.modalPresentationStyle = .pageSheet
        boven.present(vc, animated: true)
        return true
      }
    }
  }

  /// Op de hoofdthread: de twee lijstjes hierboven worden alleen hier gelezen
  /// en geschreven, dus twee gelijktijdige aanvragen kunnen elkaar niet raken.
  @MainActor
  private func scene(_ lat: Double, _ lon: Double) async throws -> MKLookAroundScene? {
    let k = Self.sleutel(lat, lon)
    if let bekend = scenes[k] { return bekend }
    if geen.contains(k) { return nil }
    let verzoek = MKLookAroundSceneRequest(coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon))
    // Geen scène is geen fout: dan heeft Apple hier gewoon geen beelden.
    let scene = try? await verzoek.scene
    if let scene { scenes[k] = scene } else { geen.insert(k) }
    return scene
  }

  /// Vijf decimalen is ruim een meter; gelijk aan de sleutel op de backend.
  private static func sleutel(_ lat: Double, _ lon: Double) -> String {
    String(format: "%.5f_%.5f", lat, lon)
  }

  private static func cacheMap() -> URL {
    let map = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("lookaround", isDirectory: true)
    try? FileManager.default.createDirectory(at: map, withIntermediateDirectories: true)
    return map
  }
}
