import SwiftUI
import CoreText

struct Fixture: Decodable {
    struct Member: Decodable { let id: UUID; let userId: Int; let name: String; let imageURL: String }
    struct Item: Decodable { let name: String; let quantity: Int; let unitPrice: Double; let totalPrice: Double }
    struct Receipt: Decodable { let restaurantName: String; let items: [Item] }
    let members: [Member]; let receipt: Receipt
    static let shared = try! JSONDecoder().decode(Fixture.self, from: Data(contentsOf: Bundle.main.url(forResource: "receipt", withExtension: "json")!))
}
@main struct ReceiptReferenceApp: App {
    @State private var title = Fixture.shared.receipt.restaurantName
    let mode = ProcessInfo.processInfo.arguments.dropFirst().first ?? "assignment"
    init() {
        if let data = UIImage(named: "receiptPlaceholder")?.pngData() {
            let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            try? data.write(to: documents.appendingPathComponent("receipt.png"))
        }
        // Register the declared fonts only in this isolated reference process.
        for url in Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: nil) ?? [] {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
        let systemFont = URL(fileURLWithPath: "/System/Library/Fonts/Core/SFCompactRounded.ttf")
        CTFontManagerRegisterFontsForURL(systemFont as CFURL, .process, nil)
    }
    var body: some Scene {
        WindowGroup {
            NavigationStack {
                if mode == "capture" {
                    ScanBillView(onBack: {})
                } else if mode == "saving" {
                    VStack(spacing: 16) {
                        ProgressView().scaleEffect(1.5)
                        Text("Creating expense...").font(.custom("Be Vietnam Pro", size: 14)).foregroundStyle(Constants.ContentM)
                    }.frame(maxWidth: .infinity, maxHeight: .infinity).background(Constants.Background)
                } else if mode == "parsing" || mode == "error" {
                    GeometryReader { proxy in
                        Image("receiptPlaceholder").resizable().scaledToFill()
                            .frame(width: max(proxy.size.width - 40, 0), height: max(proxy.size.height - 98, 0))
                            .clipShape(RoundedRectangle(cornerRadius: 40, style: .continuous))
                            .overlay { RoundedRectangle(cornerRadius: 40, style: .continuous).fill(.black.opacity(0.4)) }
                            .overlay { VStack(spacing: 12) { ProgressView().tint(.white).scaleEffect(1.5); Text("Scanning receipt...").font(.custom("Be Vietnam Pro", size: 14)).foregroundStyle(.white) } }
                            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .top)
                    }.background(Constants.Background)
                } else {
                    DnDBillItemsView(members: Fixture.shared.members.map { DnDBillMemberItem(id: $0.id, userId: $0.userId, name: $0.name, imageURL: $0.imageURL) }, breakdownRows: rows, currency: .THB, restaurantName: $title, onConfirm: { _ in }, onDismiss: {})
                }
            }.alert("Error", isPresented: .constant(mode == "error")) { Button("Retake") {} } message: { Text("No items detected in the receipt.") }.environment(\.locale, Locale(identifier: "en_US")).preferredColorScheme(.light)
        }
    }
    private var rows: [[DnDBillBreakdownItem]] {
        let items = Fixture.shared.receipt.items.map { item in
            DnDBillBreakdownItem(name: item.name, quantity: item.quantity > 1 ? item.quantity : nil, price: DnDBillBreakdownItem.formatPrice(Int(((item.quantity > 1 ? item.unitPrice : item.totalPrice) * 100).rounded()), currency: .THB), priceValue: Int((item.totalPrice * 100).rounded()))
        }
        return stride(from: 0, to: items.count, by: 2).map { Array(items[$0..<min($0 + 2, items.count)]) }
    }
}
