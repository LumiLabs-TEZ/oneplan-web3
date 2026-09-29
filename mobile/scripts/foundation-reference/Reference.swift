import SwiftUI

// Only the generated DTO shape is supplied locally. Production NoteCardRow is unmodified.
enum Components { enum Schemas {
  struct TripNoteDto { let id: Int; let title: String; let body: String?; let createdAt: String; let isDone: Bool }
} }

struct Fixture: Decodable {
  struct QR: Decodable { let content: String; let size: CGFloat }
  struct Note: Decodable { let id: Int; let title: String; let body: String; let isDone: Bool; let createdAt: String }
  let qr: QR
  let notes: [Note]
}

@main struct FoundationReference: App {
  private let surface = UserDefaults.standard.string(forKey: "surface") ?? "onboarding"
  private let fixture = try! JSONDecoder().decode(Fixture.self, from: Data(contentsOf: Bundle.main.url(forResource: "overview", withExtension: "json")!))
  var body: some Scene {
    WindowGroup {
      Group {
        if surface == "onboarding" {
          OnboardingView(onComplete: {})
        } else if surface == "trial" {
          FreeTrialView(expiryDate: Date().addingTimeInterval(42 * 60 + 17), onClose: {})
            .environment(StoreManager())
        } else if surface == "photos" {
          PlanImageStrip(images: ["freeTrialScooter", "rewardBolt", "rewardPro30d"].compactMap { UIImage(named: $0) },
            imageUrls: [], imageSize: 112, spacing: 8, cornerRadius: 12)
            .padding(16).frame(maxWidth: .infinity, maxHeight: .infinity).background(Constants.Background)
        } else if surface == "compass" {
          LocationCompassWidget(distanceText: Locale.current.language.languageCode?.identifier == "vi" ? "2,2 km" : "2.2 km", bearingDegrees: 0, deviceHeadingDegrees: -45)
            .frame(maxWidth: .infinity, maxHeight: .infinity).background(Constants.Background)
        } else if surface == "qr" {
          StyledQRCodeView(content: fixture.qr.content, color: Constants.BlueBase, size: fixture.qr.size)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(.white)
        } else {
          InteractiveNotes(notes: fixture.notes)
          .padding(8).background(.white).clipShape(RoundedRectangle(cornerRadius: 32))
          .padding(10)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(Constants.Background)
        }
      }
    }
  }
}

private struct InteractiveNotes: View {
  let notes: [Fixture.Note]
  @State private var toggled = Set<Int>()
  var body: some View {
    VStack(spacing: 8) {
      ForEach(notes, id: \.id) { note in
        NoteCardRow(note: TripNote(id: note.id, title: note.title, body: note.body,
          date: TripNote.parseISODate(note.createdAt)!, isDone: note.isDone != toggled.contains(note.id)),
          onToggle: { if toggled.contains(note.id) { toggled.remove(note.id) } else { toggled.insert(note.id) } })
      }
    }
  }
}

// Only service boundaries are replaced. The production layout remains unmodified.
struct Product {
  let displayPrice = "$2.99"
  static func products(for identifiers: [String]) async throws -> [Product] { [Product()] }
}
@Observable final class StoreManager {
  enum Tier { case free, proMonthly }
  var currentTier = Tier.free
  var isPurchasing = false
  var error: String?
  func purchase(_ product: Product) async throws {}
}
struct AnalyticsClient {
  enum Event { case SUBSCRIPTION_VIEWED }
  static let shared = AnalyticsClient()
  func track(_ event: Event) {}
}
struct CachedRemoteImage<Content: View, Placeholder: View>: View {
  let url: URL?
  var targetSize: CGSize? = nil
  @ViewBuilder let content: (Image) -> Content
  @ViewBuilder let placeholder: () -> Placeholder
  var body: some View { placeholder() }
}
