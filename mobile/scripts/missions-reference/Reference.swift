import SwiftUI
struct MissionStateDto: Codable {
 var missionId: String; var group: String; var rewardAmount: Int; var completed: Bool; var completedAt: String?
}
struct ShopItemStateDto: Codable {
 var itemId: String; var price: Int; var rewardType: String; var redeemedCount: Int; var available: Bool
}
struct MissionsOverviewDto: Codable {
 var balance: Int; var totalEarned: Int; var missions: [MissionStateDto]; var shopItems: [ShopItemStateDto]
}
struct RedeemResultDto { var itemId: String; var price: Int; var newBalance: Int; var subscriptionExpiresAt: String? = nil }
@Observable final class StoreManager { var isPro = false }
@MainActor @Observable final class MissionsService {
 var overview: MissionsOverviewDto? = try! JSONDecoder().decode(MissionsOverviewDto.self, from: Data(contentsOf: Bundle.main.url(forResource: "overview", withExtension: "json")!))
 func fetchOverview() async {}
 func reportSheetViewed(source: String) {}
 func reportAppStoreReviewOpened() {}
 func redeem(itemId: String) async -> RedeemResultDto? {
   guard let item = overview?.shopItems.first(where: { $0.itemId == itemId }), item.available, overview!.balance >= item.price else { return nil }
   overview!.balance -= item.price
   return .init(itemId: itemId, price: item.price, newBalance: overview!.balance)
 }
}
struct APIClient {
 static let shared = APIClient()
 struct Input {}
 struct Quota { var available = 4 }
 struct Body { var json = Quota() }
 struct OK { var body = Body() }
 struct Output { var ok = OK() }
 func getPinExtractionQuota(_ input: Input) async throws -> Output { Output() }
}
@main struct MissionsReference: App {
 var body: some Scene { WindowGroup {
 Color.white.sheet(isPresented: .constant(true)) { MissionsSheetView(source: "home").environment(StoreManager()) }.preferredColorScheme(.light).task {
 for name in ["rewardScanCredit", "rewardMarketUnlock", "rewardPro7d", "rewardPro30d"] {
   let original = UIImage(named: name)!
   let format = UIGraphicsImageRendererFormat(); format.scale = 3
   let size = CGSize(width: original.size.width / original.size.height * 120, height: 120)
   let rendered = UIGraphicsImageRenderer(size: size, format: format).image { _ in original.draw(in: CGRect(origin: .zero, size: size)) }
   let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent(name + "@3x.png")
   try? rendered.pngData()?.write(to: url)
 }
}
 }}
}
